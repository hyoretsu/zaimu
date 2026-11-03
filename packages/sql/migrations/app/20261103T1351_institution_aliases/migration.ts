#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI, sql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/2251ee5f545dd0cca27f5fab97b8c9d282d67a0b0f8a3278e8486ca48e0f9b58/contract";
import endContract from "../../snapshots/2251ee5f545dd0cca27f5fab97b8c9d282d67a0b0f8a3278e8486ca48e0f9b58/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract";
import startContract from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("aliases", "character varying(100)[]", {
					codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 100 } },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addCheckConstraint({
				constraint: "FinancialInstitution_aliases_elem_not_null_3676266c",
				expression: sql`array_position("aliases", NULL) IS NULL`,
				schema: "public",
				table: "FinancialInstitution",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
