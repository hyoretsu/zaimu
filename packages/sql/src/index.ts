import "dotenv/config";
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
	idleTimeoutMillis: Number(process.env.PRISMA_POOL_IDLE_TIMEOUT_MS ?? 30_000),
	max: Number(process.env.PRISMA_POOL_MAX ?? 20),
	min: Number(process.env.PRISMA_POOL_MIN ?? 0),
});
export const queryRaw = async <Row extends Record<string, unknown>>(text: string, values: unknown[] = []) =>
	(await pool.query<Row>(text, values)).rows;
export const executeRaw = async (text: string, values: unknown[] = []) => pool.query(text, values);
export const withRawTransaction = async <Result>(
	operation: (
		query: <Row extends QueryResultRow>(text: string, values?: unknown[]) => Promise<Row[]>,
	) => Promise<Result>,
) => {
	const client: PoolClient = await pool.connect();
	try {
		await client.query("BEGIN");
		const result = await operation(
			async <Row extends QueryResultRow>(text: string, values: unknown[] = []) =>
				(await client.query<Row>(text, values)).rows,
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

export const db = postgres<Contract>({ contractJson, pg: pool });

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
		const rows = await client.query<ResultType<Plan>>(plan as unknown as SqlOrmPlan<ResultType<Plan>>);
		return normalizeNumericColumns(plan, rows) as NormalizeDatabaseValue<ResultType<Plan>>[];
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
	db.transaction(transaction => operation(createExecutor(transaction)));

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
