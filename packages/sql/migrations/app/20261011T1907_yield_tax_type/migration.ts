#!/usr/bin/env -S node
import { col, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/9f840a405d649c3fa6ef9a9d4af38b1f642206ec8357ae2ca6eb945bdc1a8fb8/contract";
import startContract from "../../snapshots/9f840a405d649c3fa6ef9a9d4af38b1f642206ec8357ae2ca6eb945bdc1a8fb8/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/52198e4524b2dce87ad5056a4ae46ab075a7a494e4cf6ca64dcf3a78ef3ac48c/contract";
import endContract from "../../snapshots/52198e4524b2dce87ad5056a4ae46ab075a7a494e4cf6ca64dcf3a78ef3ac48c/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("yieldTaxType", "character varying(20)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("yieldTaxType", "character varying(20)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
				}),
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addColumn({
				column: col("yieldTaxType", "character varying(20)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
