#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/5f6b4cd90770cc8d161af5e9a6dec4e91e58593d2bb41e6abed6efc78ff6c2c7/contract";
import startContract from "../../snapshots/5f6b4cd90770cc8d161af5e9a6dec4e91e58593d2bb41e6abed6efc78ff6c2c7/contract.json" with { type: "json" };
import type { Contract as End } from "../../snapshots/ec3991a80af4806c580f49042477bf9891cac2f4c4817722a8c0aaa2cac63163/contract";
import endContract from "../../snapshots/ec3991a80af4806c580f49042477bf9891cac2f4c4817722a8c0aaa2cac63163/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("accountType", "character varying(16)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
