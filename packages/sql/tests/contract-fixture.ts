import type { Client } from "pg";

interface Column {
	nativeType: string;
	nullable: boolean;
	typeParams?: { length?: number; precision?: number; scale?: number };
	default?: { kind: string; value?: unknown; expression?: string };
}
interface Table {
	columns: Record<string, Column>;
	primaryKey?: { columns: string[]; name: string };
	uniques: { columns: string[]; name: string }[];
	indexes: { columns: string[]; name: string; unique: boolean }[];
	foreignKeys: {
		name: string;
		onDelete: string;
		onUpdate: string;
		source: { columns: string[] };
		target: { tableName: string; columns: string[] };
	}[];
}
interface ContractFixture {
	storage: {
		namespaces: {
			public: {
				entries: { table: Record<string, Table>; native_enum: Record<string, { members: string[] }> };
			};
		};
	};
}
const quote = (value: string) => `"${value.replaceAll('"', '""')}"`;
const literal = (value: unknown) =>
	typeof value === "boolean"
		? String(value)
		: typeof value === "number"
			? String(value)
			: value === null
				? "NULL"
				: `'${(typeof value === "object" ? JSON.stringify(value) : String(value)).replaceAll("'", "''")}'`;
export function assertLocalRecurrenceTestUrl(url: string) {
	const target = new URL(url);
	if (
		!["localhost", "127.0.0.1"].includes(target.hostname) ||
		!target.pathname.startsWith("/zaimu_recurrence_test")
	)
		throw new Error("Use dedicated local zaimu_recurrence_test database.");
}
/** Reconstruct an emitted contract in a dedicated disposable database for migration tests. */
export async function installContractFixture(client: Client, input: unknown) {
	const { table: tables, native_enum: enums } = (input as ContractFixture).storage.namespaces.public
		.entries;
	await client.query(
		"CREATE FUNCTION cuid2() RETURNS text LANGUAGE SQL AS $$ SELECT gen_random_uuid()::text $$",
	);
	for (const [name, value] of Object.entries(enums))
		await client.query(`CREATE TYPE ${quote(name)} AS ENUM (${value.members.map(literal).join(",")})`);
	for (const [name, table] of Object.entries(tables)) {
		const columns = Object.entries(table.columns).map(([name, column]) => {
			let type = column.nativeType;
			const params = column.typeParams;
			if (enums[type]) type = quote(type);
			else if (params?.length) type += `(${params.length})`;
			else if (type === "numeric" && params?.precision)
				type += `(${params.precision}${params.scale === undefined ? "" : `,${params.scale}`})`;
			else if (["timestamp", "timestamptz", "time"].includes(type) && params?.precision !== undefined)
				type += `(${params.precision})`;
			return `${quote(name)} ${type}${column.nullable ? "" : " NOT NULL"}${column.default ? ` DEFAULT ${column.default.kind === "literal" ? literal(column.default.value) : column.default.expression}` : ""}`;
		});
		if (table.primaryKey)
			columns.push(
				`CONSTRAINT ${quote(table.primaryKey.name)} PRIMARY KEY (${table.primaryKey.columns.map(quote).join(",")})`,
			);
		for (const unique of table.uniques)
			columns.push(`CONSTRAINT ${quote(unique.name)} UNIQUE (${unique.columns.map(quote).join(",")})`);
		await client.query(`CREATE TABLE ${quote(name)} (${columns.join(",")})`);
		for (const index of table.indexes)
			await client.query(
				`CREATE ${index.unique ? "UNIQUE " : ""}INDEX ${quote(index.name)} ON ${quote(name)} (${index.columns.map(quote).join(",")})`,
			);
	}
	const action: Record<string, string> = {
		cascade: "CASCADE",
		noAction: "NO ACTION",
		restrict: "RESTRICT",
		setDefault: "SET DEFAULT",
		setNull: "SET NULL",
	};
	for (const [name, table] of Object.entries(tables))
		for (const fk of table.foreignKeys)
			await client.query(
				`ALTER TABLE ${quote(name)} ADD CONSTRAINT ${quote(fk.name)} FOREIGN KEY (${fk.source.columns.map(quote).join(",")}) REFERENCES ${quote(fk.target.tableName)} (${fk.target.columns.map(quote).join(",")}) ON DELETE ${action[fk.onDelete] ?? "NO ACTION"} ON UPDATE ${action[fk.onUpdate] ?? "NO ACTION"}`,
			);
}
