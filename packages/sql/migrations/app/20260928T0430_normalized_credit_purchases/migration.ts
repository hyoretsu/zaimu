#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/02ae9281e9c70a5344267de7e6d46a07785edab869cb8fd21559609cba5adc68/contract";
import startContract from "../../snapshots/02ae9281e9c70a5344267de7e6d46a07785edab869cb8fd21559609cba5adc68/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/fcc9506ccbe08176bc9aea5feddaf30f8a7f51ca1f6df7624568a8d9311c403d/contract";
import endContract from "../../snapshots/fcc9506ccbe08176bc9aea5feddaf30f8a7f51ca1f6df7624568a8d9311c403d/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createNativeEnumType({
				members: ["KEEP_INSTALLMENTS", "CANCEL_FUTURE_INSTALLMENTS"],
				schema: "public",
				typeName: "CreditRefundPolicy",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("hasImportedAmount", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("number", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["purchaseId", "number"], { name: "CreditInstallmentPlan_pkey" })],
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("hasImportedAmount", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("number", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("occurrenceDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("settledByPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditInstallmentRecord_pkey" })],
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.createTable({
				columns: [
					col("cashbackAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("cashbackAmount", "numeric(18,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 18, scale: 4 } },
					}),
					col("cashbackYieldPeriod", '"CashbackYieldPeriod"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "CashbackYieldPeriod" } },
					}),
					col("cashbackYieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("cashbackYieldReferenceRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("categoryId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("feeAmount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
					}),
					col("feeDescription", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("purchaseDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("subscriptionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("subscriptionOccurrenceDate", "date", { codecRef: { codecId: "pg/date@1" } }),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time@1", typeParams: { precision: 3 } },
					}),
					col("totalAmount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
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
				constraints: [primaryKey(["id"], { name: "CreditPurchaseRecord_pkey" })],
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("cancellationEligible", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("creditDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("policy", '"CreditRefundPolicy"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "CreditRefundPolicy" } },
						notNull: true,
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditRefundRecord_pkey" })],
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(12,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
						notNull: true,
					}),
					col("chargeDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditStatementCharge_pkey" })],
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addColumn({
				column: col("creditRefundPolicy", '"CreditRefundPolicy"', {
					codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "CreditRefundPolicy" } },
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.createIndex({
				columns: ["purchaseId", "number"],
				extras: { unique: true },
				index: "CreditInstallmentRecord_purchase_number_key",
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.createIndex({
				columns: ["statementId", "occurrenceDate"],
				index: "CreditInstallmentRecord_statement_date_idx",
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.createIndex({
				columns: ["categoryId"],
				index: "CreditPurchaseRecord_categoryId_idx",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createIndex({
				columns: ["creditCardId", "purchaseDate"],
				index: "CreditPurchaseRecord_creditCardId_date_idx",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createIndex({
				columns: ["externalId"],
				extras: { unique: true },
				index: "CreditPurchaseRecord_externalId_key",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createIndex({
				columns: ["subscriptionId", "subscriptionOccurrenceDate"],
				extras: { unique: true },
				index: "CreditPurchaseRecord_subscription_occurrence_key",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createIndex({
				columns: ["userId", "purchaseDate", "createdAt", "id"],
				index: "CreditPurchaseRecord_userId_date_idx",
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.createIndex({
				columns: ["purchaseId", "creditDate"],
				index: "CreditRefundRecord_purchase_date_idx",
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.createIndex({
				columns: ["statementId", "creditDate"],
				index: "CreditRefundRecord_statement_date_idx",
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.createIndex({
				columns: ["statementId", "chargeDate"],
				index: "CreditStatementCharge_statement_date_idx",
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditInstallmentPlan_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditInstallmentRecord_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["statementId"],
					name: "CreditInstallmentRecord_statementId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardStatement" },
				},
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditPurchaseRecord_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditPurchaseRecord_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["categoryId"],
					name: "CreditPurchaseRecord_categoryId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditRefundRecord_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["statementId"],
					name: "CreditRefundRecord_statementId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardStatement" },
				},
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["statementId"],
					name: "CreditStatementCharge_statementId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardStatement" },
				},
				schema: "public",
				table: "CreditStatementCharge",
			}),
			rawSql({
				execute: [
					{
						description: "Validate normalized positive amounts and installment numbers",
						sql: `
            ALTER TABLE "CreditPurchaseRecord" ADD CONSTRAINT "CreditPurchaseRecord_totalAmount_positive" CHECK ("totalAmount" > 0);
            ALTER TABLE "CreditInstallmentPlan" ADD CONSTRAINT "CreditInstallmentPlan_amount_positive" CHECK ("amount" > 0 AND "number" BETWEEN 1 AND 48);
            ALTER TABLE "CreditInstallmentRecord" ADD CONSTRAINT "CreditInstallmentRecord_amount_positive" CHECK ("amount" > 0 AND "number" BETWEEN 1 AND 48);
            ALTER TABLE "CreditRefundRecord" ADD CONSTRAINT "CreditRefundRecord_amount_positive" CHECK ("amount" > 0);
            ALTER TABLE "CreditStatementCharge" ADD CONSTRAINT "CreditStatementCharge_amount_positive" CHECK ("amount" > 0);
          `,
					},
				],
				id: "normalizedCreditPurchases.checks",
				label: "Constrain purchase, installment, refund and charge amounts",
				operationClass: "additive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
