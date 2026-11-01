import { expect, test } from "bun:test";
import { readFile } from "node:fs/promises";
import { join } from "node:path";

const root = join(import.meta.dir, "..");
const historicalHead = "1ce00365762f398d639512abcc6b130d22364beea5f36452debb2fdb137caa62";
const nativeAliases: Record<string, string> = {
	boolean: "bool",
	"character varying": "varchar",
	integer: "int4",
	smallint: "int2",
	"time without time zone": "time",
	"timestamp with time zone": "timestamptz",
	"timestamp without time zone": "timestamp",
};

// Compare physical semantics, not the RC's changed contract serialization or JS codecs.
// Enum identity remains compared through typeParams.typeName and valueSet.
function physical(value: unknown): unknown {
	if (Array.isArray(value)) return value.map(physical);
	if (!value || typeof value !== "object") return value;
	const input = value as Record<string, unknown>;
	const output = Object.fromEntries(
		Object.entries(input)
			.filter(([key]) => key !== "codecId" && key !== "index")
			.map(([key, child]) => [key, physical(child)]),
	);
	if (typeof output.nativeType === "string") {
		const type = output.nativeType;
		output.dataType = input.valueSet ? "pg/enum" : `pg/${nativeAliases[type] ?? type}`;
		delete output.nativeType;
	}
	if (output.many === true) output.many = { elementNullable: false };
	return output;
}

test("latest native contract preserves all historical head physical storage", async () => {
	const historical = JSON.parse(
		await readFile(join(root, "migrations/snapshots", historicalHead, "contract.json"), "utf8"),
	);
	const latest = JSON.parse(await readFile(join(root, "out/prisma/contract.json"), "utf8"));
	const tables = latest.storage.namespaces.public.entries.table;
	expect(Object.keys(tables)).toHaveLength(90);
	expect(tables.taxDefinition).toBeDefined();
	expect(tables.taxDefinitionVersion).toBeDefined();
	expect(tables.OpenFinanceRun.columns.errors.default.value).toBe("[]");
	expect(tables.CreditCardImportItem.columns.metadataMissing.default.value).toBe("[]");
	expect(tables.OutboxEvent.columns.payload.default.value).toBe("{}");
	expect(physical(latest.storage.namespaces)).toEqual(physical(historical.storage.namespaces));
});
