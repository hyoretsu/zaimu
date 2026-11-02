#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/0da3dd5cbaeda84c9f4583c0f980da783941c366881c591f1d09fff6b5ac7988/contract";
import endContract from "../../snapshots/0da3dd5cbaeda84c9f4583c0f980da783941c366881c591f1d09fff6b5ac7988/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/ec3991a80af4806c580f49042477bf9891cac2f4c4817722a8c0aaa2cac63163/contract";
import startContract from "../../snapshots/ec3991a80af4806c580f49042477bf9891cac2f4c4817722a8c0aaa2cac63163/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				members: ["DAILY", "ON_REDEMPTION"],
				schema: "public",
				typeName: "FinancialAccountYieldTaxMode",
			}),
			this.addColumn({
				column: col("yieldTaxMode", '"FinancialAccountYieldTaxMode"', {
					codecRef: {
						codecId: "pg/enum@1",
						typeParams: { typeName: "FinancialAccountYieldTaxMode" },
					},
					default: lit("DAILY"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("yieldTaxMode", '"FinancialAccountYieldTaxMode"', {
					codecRef: {
						codecId: "pg/enum@1",
						typeParams: { typeName: "FinancialAccountYieldTaxMode" },
					},
					default: lit("DAILY"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addColumn({
				column: col("yieldTaxMode", '"FinancialAccountYieldTaxMode"', {
					codecRef: {
						codecId: "pg/enum@1",
						typeParams: { typeName: "FinancialAccountYieldTaxMode" },
					},
					default: lit("DAILY"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
