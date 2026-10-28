#!/usr/bin/env -S node
import { col, fn, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/6af0e52f81411b29960d995cd65365f2fb0d92995e7d15957dfbbb3a78ec0cbe/contract";
import endContract from "../../snapshots/6af0e52f81411b29960d995cd65365f2fb0d92995e7d15957dfbbb3a78ec0cbe/contract.json" with { type: "json" };
import type { Contract as Start } from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract";
import startContract from "../../snapshots/e62659443b204cad0a50646e6e1e1ff44b659d6ed4ee5ee36f7da9633e32cdad/contract.json" with { type: "json" };

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addNativeEnumValue({ schema: "public", typeName: "ReferenceRateType", value: "IPCA" }),
			this.addNativeEnumValue({ schema: "public", typeName: "ReferenceRateType", value: "TR" }),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("name", "character varying(150)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 150 } },
						notNull: true,
					}),
					col("parameters", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("summary", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "LoanScenario",
			}),
			this.addColumn({
				column: col("contractBook", "json", { codecRef: { codecId: "pg/json@1" } }),
				schema: "public",
				table: "Loan",
			}),
			this.addColumn({
				column: col("institutionId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "Loan",
			}),
			this.alterColumnType({
				column: "id",
				options: {
					formatTypeExpected: "character varying(100)",
					qualifiedTargetType: "character varying(100)",
					rawTargetTypeForLabel: "character varying(100)",
				},
				schema: "public",
				table: "LoanPayment",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "Loan_institutionId_idx",
				schema: "public",
				table: "Loan",
			}),
			this.createIndex({
				columns: ["userId", "updatedAt", "id"],
				index: "LoanScenario_userId_updatedAt_id_idx",
				schema: "public",
				table: "LoanScenario",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "Loan_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "Loan",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "LoanScenario_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "LoanScenario",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
