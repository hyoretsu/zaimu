#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/d23d23fe0e77b392dc3262eaf9abb5d28367c17482dc9eb66c550389887e3a76/contract";
import endContract from "../../snapshots/d23d23fe0e77b392dc3262eaf9abb5d28367c17482dc9eb66c550389887e3a76/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e61535f5142cd65c9293b4ef5a7c5dbe4168016ee072a41f756a41405f5e67b7/contract";
import startContract from "../../snapshots/e61535f5142cd65c9293b4ef5a7c5dbe4168016ee072a41f756a41405f5e67b7/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("effectiveDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("financialInstitutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("yieldPeriod", '"FinancialAccountYieldPeriod"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldPeriod" },
						},
					}),
					col("yieldTaxRate", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "FinancialInstitutionYieldPolicy_pkey" })],
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("financialYieldPolicyId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("position", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("upToBalance", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("yieldFixedRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "FinancialInstitutionYieldRule_pkey" })],
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			this.createIndex({
				columns: ["financialInstitutionId", "effectiveDate"],
				extras: { unique: true },
				index: "FinancialInstitutionYieldPolicy_institutionId_effectiveDate_key",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createIndex({
				columns: ["financialYieldPolicyId", "position"],
				extras: { unique: true },
				index: "FinancialInstitutionYieldRule_policyId_position_key",
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialInstitutionId"],
					name: "FinancialInstitutionYieldPolicy_financialInstitutionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialYieldPolicyId"],
					name: "FinancialInstitutionYieldRule_financialYieldPolicyId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: {
						columns: ["id"],
						schema: "public",
						table: "FinancialInstitutionYieldPolicy",
					},
				},
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
