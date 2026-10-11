#!/usr/bin/env -S node
import { readFileSync } from "node:fs";
import { Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type {
	Contract as End,
	Contract as Start,
} from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract";
import endContract from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract.json" with {
	type: "json",
};
import startContract from "../../snapshots/8d83d29534d2e49ef9f8f331e886eb5a6a9d620b7fce70500f40c8a09ad5307e/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			rawSql({
				execute: [
					{
						description: "Seed initial tax catalog",
						sql: readFileSync(new URL("./seed.sql", import.meta.url), "utf8"),
					},
				],
				id: "taxDefinitions.seed",
				invariantId: "taxDefinitions.initialCatalog.v1",
				label: "Initialize IOF and IR tax definitions without overwriting existing values",
				operationClass: "data",
				postcheck: [
					{
						description: "Verify default tax definitions and versions",
						sql: `SELECT count(*) = 2 AS result FROM "taxDefinition" d JOIN "taxDefinitionVersion" v ON v."taxDefinitionId" = d."id" WHERE (d."id",v."id") IN (('iof','iof-initial'),('ir','ir-initial'))`,
					},
				],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
