import { observePool, operation as traceOperation, startDependency } from "@zaimu/observability";
import "dotenv/config";
import { AsyncLocalStorage } from "node:async_hooks";
import type { ResultType } from "@prisma/orm-postgres/components/runtime";
import type { SqlOrmPlan } from "@prisma/orm-postgres/relational-core";
import { param } from "@prisma/orm-postgres/relational-core/expression";
import postgres from "@prisma/orm-postgres/runtime";
import { contractFromJson } from "@prisma/orm-postgres/static";
import { getQueryMetrics, startOperation, startQuery } from "./query-metrics";

export { and, or } from "@prisma/orm-postgres/orm-client";
export * from "./query-metrics";

import type { Numeric } from "@prisma/orm-postgres/target/codec-types";
import type { PoolClient, QueryResultRow } from "pg";
import { Pool, types } from "pg";
import type { Contract } from "../out/prisma/contract";
import contractJson from "../out/prisma/contract.json" with { type: "json" };

type NormalizeDatabaseValue<T> =
	T extends Numeric<infer Precision, infer Scale>
		? Precision extends 38
			? Scale extends 18
				? string
				: number
			: number
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
observePool(() => ({ idle: pool.idleCount, total: pool.totalCount, waiting: pool.waitingCount }));
const telemetryEntities = new Set(
	Object.entries(contractJson.roots).flatMap(([name, root]) => [name, root.model]),
);
// Physical pg execution is the only counting layer: ORM, auth, raw SQL and transaction control.
pool.on("connect", client => {
	const query = client.query;
	client.query = ((...args: unknown[]) => {
		const finishQuery = startQuery();
		const config = args[0];
		const sqlText =
			typeof config === "string"
				? config
				: config && typeof config === "object" && "text" in config
					? String(config.text)
					: "unknown";
		const verb = sqlText.trim().split(/\s/)[0]?.toUpperCase() ?? "unknown";
		const operation = [
			"SELECT",
			"INSERT",
			"UPDATE",
			"DELETE",
			"BEGIN",
			"COMMIT",
			"ROLLBACK",
			"WITH",
		].includes(verb)
			? verb
			: "OTHER";
		const candidate = sqlText.match(
			/\b(?:FROM|INTO|UPDATE|JOIN)\s+(?:"?[a-zA-Z_][\w]*"?\.)?"?([a-zA-Z_][\w]*)"?/i,
		)?.[1];
		const entity = candidate && telemetryEntities.has(candidate) ? candidate : undefined;
		const finishTelemetry = startDependency(
			`db.${operation}`,
			undefined,
			entity ? { "db.collection.name": entity } : {},
		);
		const finishSpan = startOperation(`sql:${operation}`);
		const finish = (failed = false, result?: { rowCount?: number | null }) => {
			finishTelemetry(
				failed,
				typeof result?.rowCount === "number" &&
					Number.isFinite(result.rowCount) &&
					result.rowCount >= 0
					? { "db.response.returned_rows": result.rowCount }
					: {},
			);
			finishQuery();
			finishSpan();
		};
		const callback = args.at(-1);
		if (typeof callback === "function")
			args[args.length - 1] = (...values: unknown[]) => {
				finish(Boolean(values[0]), values[1] as { rowCount?: number | null });
				return callback(...values);
			};
		try {
			const result = Reflect.apply(query, client, args);
			if (result && typeof result.then === "function")
				return result.then(
					(value: unknown) => {
						finish(false, value as { rowCount?: number | null });
						return value;
					},
					(error: unknown) => {
						finish(true);
						throw error;
					},
				);
			return result;
		} catch (error) {
			finish(true);
			throw error;
		}
	}) as typeof client.query;
});
export const getPoolMetrics = () => ({
	idle: pool.idleCount,
	total: pool.totalCount,
	waiting: pool.waitingCount,
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
				if (!connection) {
					const startedAt = performance.now();
					const metrics = getQueryMetrics();
					try {
						return await traceOperation("db.pool.acquire", () => target.connect());
					} finally {
						if (metrics?.active) metrics.connectionWaitMs += performance.now() - startedAt;
					}
				}
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
export const queryRaw = async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
	(await transactionalPool.query<Row>(text, values)).rows;
/** Preserve asset quantities before the legacy global NUMERIC parser can round them. */
export const queryRawDecimal = async <Row extends Record<string, unknown>>(
	text: string,
	values: unknown[] = [],
) =>
	(
		await transactionalPool.query<Row>({
			text,
			types: {
				getTypeParser: (oid: number, format?: "text" | "binary") =>
					oid === types.builtins.NUMERIC && format !== "binary"
						? (value: string) => value
						: types.getTypeParser(oid, format),
			},
			values,
		})
	).rows;

export const executeRaw = async (text: string, values: unknown[] = []) =>
	transactionalPool.query(text, values);
export const withRawTransaction = async <Result>(
	operation: (
		query: <Row extends QueryResultRow>(text: string, values?: unknown[]) => Promise<Row[]>,
	) => Promise<Result>,
) => {
	const existing = transactionConnection.getStore();
	if (existing)
		return operation(
			async <Row extends QueryResultRow>(text: string, values: unknown[] = []) =>
				(await existing.query<Row>(text, values)).rows,
		);
	const connectionStartedAt = performance.now();
	const client: PoolClient = await traceOperation("db.pool.acquire", () => pool.connect());
	const metrics = getQueryMetrics();
	if (metrics) metrics.connectionWaitMs += performance.now() - connectionStartedAt;
	try {
		await client.query("BEGIN");
		const result = await transactionConnection.run(client, () =>
			operation(
				async <Row extends QueryResultRow>(text: string, values: unknown[] = []) =>
					(await client.query<Row>(text, values)).rows,
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

export const contract = contractFromJson<Contract>(contractJson);
export const db = postgres({ contract, pg: transactionalPool });

type QueryPlan = SqlOrmPlan<unknown>;
type StatementPlan = Parameters<ReturnType<typeof db.runtime>["execute"]>[0];
type ExecutorClient = Pick<typeof db, "sql"> & Pick<ReturnType<typeof db.runtime>, "query" | "execute">;
interface PlanSource {
	alias?: string;
	kind?: string;
	name?: string;
	source?: PlanSource;
}
interface ProjectionItem {
	alias?: string;
	codec?: { codecId?: string; typeParams?: { precision?: number; scale?: number } };
	expr?: { column?: string; kind?: string; name?: string; table?: string };
}
interface ProjectedPlan {
	ast?: {
		from?: PlanSource;
		joins?: readonly PlanSource[];
		projection?: readonly ProjectionItem[];
		returning?: readonly ProjectionItem[];
		table?: PlanSource;
	};
}

// Some json columns were created by historical migrations with a double-encoded default (the JSON string "[]" or
// "{}", see the CreditCardImportItem.metadataMissing, OpenFinanceRun.errors and OutboxEvent.payload column defaults).
// Rows written with that default are decoded here, only for the exact physical table/column and only when the value
// is exactly the default sentinel, so genuine scalar JSON strings elsewhere are returned untouched. This applies to
// builder (`db.sql`) plans, whose provenance is resolved from the plan AST; `db.orm` results and raw queries are
// not normalized by this function and return the stored JSON value as is.
const legacyJsonDefaults: Record<string, Record<string, string>> = {
	CreditCardImportItem: { metadataMissing: "[]" },
	OpenFinanceRun: { errors: "[]" },
	OutboxEvent: { payload: "{}" },
};

const legacyJsonSentinel = (plan: ProjectedPlan, item: ProjectionItem) => {
	const ast = plan.ast;
	const { expr } = item;
	if (!ast || !expr) return undefined;
	// Query-scope names (alias, else table name) mapped to physical tables; non-table sources are not mapped.
	const scope = new Map<string, string>();
	const register = (source: PlanSource | undefined) => {
		if (source?.kind === "table-source" && source.name)
			scope.set(source.alias ?? source.name, source.name);
	};
	register(ast.from ?? ast.table);
	for (const join of ast.joins ?? []) register(join.source);
	let table: string | undefined;
	let column: string | undefined;
	if (expr.kind === "column-ref" && expr.table) {
		table = scope.get(expr.table);
		column = expr.column;
	} else if (expr.kind === "identifier-ref" && !ast.joins?.length && scope.size === 1) {
		table = [...scope.values()][0];
		column = expr.name;
	}
	return table && column ? legacyJsonDefaults[table]?.[column] : undefined;
};

const normalizeCodecColumns = <Row>(plan: QueryPlan, rows: Row[]) => {
	const projection =
		(plan as ProjectedPlan).ast?.projection ?? (plan as ProjectedPlan).ast?.returning ?? [];
	const aliasesFor = (codecIds: string[]) =>
		new Set(
			projection
				.filter(item => item.codec?.codecId && codecIds.includes(item.codec.codecId))
				.flatMap(item => (item.alias ? [item.alias] : [])),
		);
	const numericColumns = aliasesFor(["pg/numeric@1"]);
	const exactNumericColumns = new Set(
		projection
			.filter(
				item =>
					item.codec?.codecId === "pg/numeric@1" &&
					item.codec.typeParams?.precision === 38 &&
					item.codec.typeParams.scale === 18,
			)
			.flatMap(item => (item.alias ? [item.alias] : [])),
	);
	const legacyJson = new Map<string, string>();
	for (const item of projection) {
		if (!item.alias || !item.codec?.codecId || !["pg/json@1", "pg/jsonb@1"].includes(item.codec.codecId))
			continue;
		const sentinel = legacyJsonSentinel(plan as ProjectedPlan, item);
		if (sentinel) legacyJson.set(item.alias, sentinel);
	}
	if (numericColumns.size === 0 && legacyJson.size === 0) return rows;
	return rows.map(row => {
		if (!row || typeof row !== "object") return row;
		const normalized = { ...row } as Record<string, unknown>;
		for (const column of numericColumns) {
			const value = normalized[column];
			if (typeof value === "string" && !exactNumericColumns.has(column))
				normalized[column] = Number(value);
			if (exactNumericColumns.has(column) && typeof value === "number")
				throw new RangeError("Quantidade decimal perdeu precisão no executor SQL");
		}
		for (const [column, sentinel] of legacyJson)
			if (normalized[column] === sentinel) normalized[column] = JSON.parse(sentinel) as unknown;
		return normalized as Row;
	});
};

const createExecutor = (client: ExecutorClient) => {
	const queryRows = async <Plan extends QueryPlan>(plan: Plan) => {
		const rows = await client.query<ResultType<Plan>>(plan as unknown as SqlOrmPlan<ResultType<Plan>>);
		return normalizeCodecColumns(plan, rows) as NormalizeDatabaseValue<ResultType<Plan>>[];
	};
	return {
		db: client,
		executeStatement: (plan: StatementPlan) => client.execute(plan),
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
