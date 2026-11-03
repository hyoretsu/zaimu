#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/28151856b8985d881af2218466cc0939f546187f3b65d812dfaa263a05326bd3/contract";
import endContract from "../../snapshots/28151856b8985d881af2218466cc0939f546187f3b65d812dfaa263a05326bd3/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract";
import startContract from "../../snapshots/e9314176a235e1d9504581f63eda312f691ee25794386f66e903d0e481b6883f/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("yieldTaxModes", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("yieldTaxModes", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addColumn({
				column: col("yieldTaxModes", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
