import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ResultType } from "@prisma/orm-postgres/components/runtime";
import type { SqlOrmPlan } from "@prisma/orm-postgres/relational-core";
import { param } from "@prisma/orm-postgres/relational-core/expression";
import postgres from "@prisma/orm-postgres/runtime";

export { and, or } from "@prisma/orm-postgres/orm-client";

import type { Numeric, Timestamp, Timestamptz } from "@prisma/orm-postgres/target/codec-types";
import type { PoolClient, QueryResultRow } from "pg";
import { Pool, types } from "pg";
import type { Contract } from "../out/prisma/contract";
import contractJson from "../out/prisma/contract.json" with { type: "json" };

type NormalizeDatabaseValue<T> =
	T extends Numeric<infer _Precision, infer _Scale>
		? number
		: T extends Timestamp<infer _Precision> | Timestamptz<infer _Precision>
			? Date
			: T extends Date
				? Date
				: T extends string
					? string
					: T extends readonly (infer Item)[]
						? NormalizeDatabaseValue<Item>[]
						: T extends object
							? { [Key in keyof T]: NormalizeDatabaseValue<T[Key]> }
							: T;

types.setTypeParser(types.builtins.NUMERIC, value => Number(value));

const pool = new Pool({
	connectionString: process.env.DATABASE_URL,
	connectionTimeoutMillis: Number(process.env.DATABASE_CONNECTION_TIMEOUT_MS ?? 5_000),
	idleTimeoutMillis: Number(process.env.PRISMA_POOL_IDLE_TIMEOUT_MS ?? 30_000),
	max: Number(process.env.PRISMA_POOL_MAX ?? 20),
	min: Number(process.env.PRISMA_POOL_MIN ?? 0),
	query_timeout: Number(process.env.DATABASE_QUERY_TIMEOUT_MS ?? 15_000),
	statement_timeout: Number(process.env.DATABASE_STATEMENT_TIMEOUT_MS ?? 15_000),
});
// Domain helpers participate in the caller's transaction, including ORM statements.
// This keeps debt events, tags, refunds and invoice replay on one connection.
const transactionConnection = new AsyncLocalStorage<PoolClient>();
const borrowedConnections = new WeakMap<PoolClient, PoolClient>();
const transactionalPool = new Proxy(pool, {
	get(target, property) {
		if (property === "connect")
			return async () => {
				const connection = transactionConnection.getStore();
				if (!connection) return target.connect();
				let borrowed = borrowedConnections.get(connection);
				if (!borrowed) {
					borrowed = new Proxy(connection, {
						get(client, key) {
							if (key === "release") return () => undefined;
							const value = Reflect.get(client, key);
							return typeof value === "function" ? value.bind(client) : value;
						},
					});
					borrowedConnections.set(connection, borrowed);
				}
				return borrowed;
			};
		if (property === "query")
			return (...args: unknown[]) => {
				const connection = transactionConnection.getStore() ?? target;
				return Reflect.apply(connection.query, connection, args);
			};
		const value = Reflect.get(target, property);
		return typeof value === "function" ? value.bind(target) : value;
	},
});
export interface QueryMetrics {
	connectionWaitMs: number;
	queryCount: number;
	sqlDurationMs: number;
}
const queryMetricsStorage = new AsyncLocalStorage<QueryMetrics>();
const measureQuery = async <Result>(operation: () => PromiseLike<Result>) => {
	const startedAt = performance.now();
	try {
		return await Promise.resolve(operation());
	} finally {
		const metrics = queryMetricsStorage.getStore();
		if (metrics) {
			metrics.queryCount += 1;
			metrics.sqlDurationMs += performance.now() - startedAt;
		}
	}
};
export const withQueryMetrics = <Result>(operation: () => Result) =>
	queryMetricsStorage.run({ connectionWaitMs: 0, queryCount: 0, sqlDurationMs: 0 }, operation);
export const beginQueryMetrics = () =>
	queryMetricsStorage.enterWith({ connectionWaitMs: 0, queryCount: 0, sqlDurationMs: 0 });
export const getQueryMetrics = () => queryMetricsStorage.getStore();
export const queryRaw = async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
	(await measureQuery(() => transactionalPool.query<Row>(text, values))).rows;
export const executeRaw = async (text: string, values: unknown[] = []) =>
	measureQuery(() => transactionalPool.query(text, values));
export const withRawTransaction = async <Result>(
	operation: (
		query: <Row extends QueryResultRow>(text: string, values?: unknown[]) => Promise<Row[]>,
	) => Promise<Result>,
) => {
	const existing = transactionConnection.getStore();
	if (existing)
		return operation(
			async <Row extends QueryResultRow>(text: string, values: unknown[] = []) =>
				(await measureQuery(() => existing.query<Row>(text, values))).rows,
		);
	const connectionStartedAt = performance.now();
	const client: PoolClient = await pool.connect();
	const metrics = queryMetricsStorage.getStore();
	if (metrics) metrics.connectionWaitMs += performance.now() - connectionStartedAt;
	try {
		await client.query("BEGIN");
		const result = await transactionConnection.run(client, () =>
			operation(
				async <Row extends QueryResultRow>(text: string, values: unknown[] = []) =>
					(await measureQuery(() => client.query<Row>(text, values))).rows,
			),
		);
		await client.query("COMMIT");
		return result;
	} catch (error) {
		await client.query("ROLLBACK");
		throw error;
	} finally {
		client.release();
	}
};

export const db = postgres<Contract>({ contractJson, pg: transactionalPool });

type QueryPlan = SqlOrmPlan<unknown>;
type StatementPlan = Parameters<ReturnType<typeof db.runtime>["execute"]>[0];
type ExecutorClient = Pick<typeof db, "sql"> & Pick<ReturnType<typeof db.runtime>, "query" | "execute">;
interface ProjectedPlan {
	ast?: {
		projection?: readonly {
			alias?: string;
			codec?: { codecId?: string };
		}[];
		returning?: readonly {
			alias?: string;
			codec?: { codecId?: string };
		}[];
	};
}

const normalizeNumericColumns = <Row>(plan: QueryPlan, rows: Row[]) => {
	const numericColumns = new Set(
		((plan as ProjectedPlan).ast?.projection ?? (plan as ProjectedPlan).ast?.returning ?? [])
			.filter(item => item.codec?.codecId === "pg/numeric@1")
			.flatMap(item => (item.alias ? [item.alias] : [])),
	);
	if (numericColumns.size === 0) return rows;
	return rows.map(row => {
		if (!row || typeof row !== "object") return row;
		const normalized = { ...row } as Record<string, unknown>;
		for (const column of numericColumns) {
			const value = normalized[column];
			if (typeof value === "string") normalized[column] = Number(value);
		}
		return normalized as Row;
	});
};

const createExecutor = (client: ExecutorClient) => {
	const queryRows = async <Plan extends QueryPlan>(plan: Plan) => {
		const rows = await measureQuery(() =>
			client.query<ResultType<Plan>>(plan as unknown as SqlOrmPlan<ResultType<Plan>>),
		);
		return normalizeNumericColumns(plan, rows) as NormalizeDatabaseValue<ResultType<Plan>>[];
	};
	return {
		db: client,
		executeStatement: (plan: StatementPlan) => measureQuery(() => client.execute(plan)),
		queryFirst: async <Plan extends QueryPlan>(plan: Plan) => (await queryRows(plan))[0],
		queryRows,
	};
};

const runtime = db.runtime();
const executor = createExecutor({
	execute: runtime.execute.bind(runtime),
	query: runtime.query.bind(runtime),
	sql: db.sql,
});
export const { executeStatement, queryFirst, queryRows } = executor;
export type SqlExecutor = ReturnType<typeof createExecutor>;

export const withTransaction = async <Result>(operation: (transaction: SqlExecutor) => Promise<Result>) =>
	transactionConnection.getStore() ? operation(executor) : withRawTransaction(() => operation(executor));

export const numeric = <Precision extends number, Scale extends number | undefined>(value: number | string) =>
	String(value) as Numeric<Precision, Scale>;

// Prisma 8 currently omits `null` from nullable numeric write types even though PostgreSQL accepts it.
export const nullableNumeric = <Precision extends number, Scale extends number | undefined>(
	value: null | number | string,
) => (value === null ? null : String(value)) as Numeric<Precision, Scale>;

export const closeDatabase = async () => {
	await db.close();
	await pool.end();
};

export type { Contract } from "../out/prisma/contract";
export { param };
