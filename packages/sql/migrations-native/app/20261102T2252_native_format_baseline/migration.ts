#!/usr/bin/env -S bun
import {
	checkExpression,
	col,
	fn,
	lit,
	Migration,
	MigrationCLI,
	primaryKey,
	sql,
} from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/e15dbe7f999388cc745849f8ad489efd47fded20f72115b5aaa2f654271b09ce/contract";
import endContract from "../../snapshots/e15dbe7f999388cc745849f8ad489efd47fded20f72115b5aaa2f654271b09ce/contract.json" with { type: "json" };

export default class M extends Migration<never, End> {
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createSchema({ schema: "public" }),
			this.createNativeEnumType({
				members: ["FRONT", "BACK"],
				schema: "public",
				typeName: "AdvanceType",
			}),
			this.createNativeEnumType({
				members: ["PRICE", "SAC"],
				schema: "public",
				typeName: "AmortizationType",
			}),
			this.createNativeEnumType({
				members: ["MONTHLY", "YEARLY"],
				schema: "public",
				typeName: "CashbackYieldPeriod",
			}),
			this.createNativeEnumType({
				members: ["MERCADO_PAGO", "BRADESCO", "INTER", "NUBANK", "PICPAY", "MEUPLUGGY", "WILL_BANK"],
				schema: "public",
				typeName: "CreditCardImportProvider",
			}),
			this.createNativeEnumType({
				members: ["KEEP_INSTALLMENTS", "CANCEL_FUTURE_INSTALLMENTS"],
				schema: "public",
				typeName: "CreditRefundPolicy",
			}),
			this.createNativeEnumType({
				members: ["PENDING", "ACCEPTED", "DECLINED"],
				schema: "public",
				typeName: "DebtConnectionStatus",
			}),
			this.createNativeEnumType({
				members: ["ORIGIN", "TRANSACTION", "PURCHASE", "MIGRATED_SETTLEMENT"],
				schema: "public",
				typeName: "DebtEventKind",
			}),
			this.createNativeEnumType({
				members: ["SHARES", "PERCENTAGE", "FIXED"],
				schema: "public",
				typeName: "DebtSplitMode",
			}),
			this.createNativeEnumType({
				members: ["CHECKING", "SAVINGS", "INVESTMENT", "CASH", "CREDIT_CARD", "REWARDS"],
				schema: "public",
				typeName: "FinancialAccountType",
			}),
			this.createNativeEnumType({
				members: ["AUTOMATIC", "MANUAL"],
				schema: "public",
				typeName: "FinancialAccountYieldKind",
			}),
			this.createNativeEnumType({
				members: ["SYSTEM", "USER"],
				schema: "public",
				typeName: "FinancialAccountYieldOrigin",
			}),
			this.createNativeEnumType({
				members: ["MONTHLY", "YEARLY"],
				schema: "public",
				typeName: "FinancialAccountYieldPeriod",
			}),
			this.createNativeEnumType({
				members: ["DEBIT", "CREDIT", "PIX", "CASH", "TRANSFER", "BOLETO"],
				schema: "public",
				typeName: "PaymentMethod",
			}),
			this.createNativeEnumType({
				members: ["DAILY", "WEEKLY", "BIWEEKLY", "MONTHLY", "YEARLY"],
				schema: "public",
				typeName: "RecurrenceFrequency",
			}),
			this.createNativeEnumType({
				members: ["CDI", "SELIC", "IPCA", "TR"],
				schema: "public",
				typeName: "ReferenceRateType",
			}),
			this.createNativeEnumType({
				members: ["POINTS", "CASHBACK"],
				schema: "public",
				typeName: "RewardsAccountKind",
			}),
			this.createNativeEnumType({
				members: ["INCOME", "EXPENSE", "TRANSFER", "YIELD"],
				schema: "public",
				typeName: "TransactionImportItemType",
			}),
			this.createNativeEnumType({
				members: [
					"MERCADO_PAGO",
					"NUBANK",
					"GENERIC",
					"BANCO_DO_BRASIL",
					"INTER",
					"PICPAY",
					"MEUPLUGGY",
				],
				schema: "public",
				typeName: "TransactionImportProvider",
			}),
			this.createNativeEnumType({
				members: ["PENDING", "APPROVED"],
				schema: "public",
				typeName: "TransactionImportStatus",
			}),
			this.createNativeEnumType({
				members: ["INCOME", "EXPENSE", "TRANSFER"],
				schema: "public",
				typeName: "TransactionType",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("recipientId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("respondedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("senderId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("summary", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createTable({
				columns: [
					col("accountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("transferId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("readAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("type", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "AppNotification",
			}),
			this.createTable({
				columns: [
					col("archivedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("original", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("recordId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(80)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 80 } },
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["source", "recordId"], { name: "ApplicationUpgradeArchive_pkey" })],
				schema: "public",
				table: "ApplicationUpgradeArchive",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("legacyId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["userId", "source", "legacyId"], {
						name: "ApplicationUpgradeRecurrence_pkey",
					}),
				],
				schema: "public",
				table: "ApplicationUpgradeRecurrence",
			}),
			this.createTable({
				columns: [
					col("balance", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "BalanceAdjustment_pkey" })],
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.createTable({
				columns: [
					col("color", "character varying(7)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 7 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("icon", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("parentId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "Category_pkey" })],
				schema: "public",
				table: "Category",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("completedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("consumer", "character varying(120)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 120 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("eventId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("lastError", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["consumer", "eventId"], { name: "ConsumerReceipt_pkey" })],
				schema: "public",
				table: "ConsumerReceipt",
			}),
			this.createTable({
				columns: [
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("entryKind", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditBookTombstone_pkey" })],
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.createTable({
				columns: [
					col("calendarHistory", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("cashbackAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("cashbackRate", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
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
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditLimit", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dueDay", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("excludeFromTotals", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("ignoreStatementsBefore", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("paymentAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("paymentSuggestionsEnabled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("securityDeposit", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("statementDay", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("workingDueDate", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditCard_pkey" })],
				schema: "public",
				table: "CreditCard",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
				],
				constraints: [primaryKey(["id"], { name: "CreditCardHistory_pkey" })],
				schema: "public",
				table: "CreditCardHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("fileName", "character varying(255)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 255 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("provider", '"CreditCardImportProvider"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "CreditCardImportProvider" },
						},
						notNull: true,
					}),
					col("reportedPreviousBalance", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("statementDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("status", '"TransactionImportStatus"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "TransactionImportStatus" },
						},
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditCardImport_pkey" })],
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardImportId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("currentInstallment", "int2", {
						codecRef: { codecId: "pg/int2@1" },
						default: lit(1),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("installmentAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("installments", "int2", {
						codecRef: { codecId: "pg/int2@1" },
						default: lit(1),
						notNull: true,
					}),
					col("isSelected", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("isStatementCharge", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("metadataMissing", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: lit("[]"),
						notNull: true,
					}),
					col("purchaseDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("reconciledCreditPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("refundReview", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("taxSourceExternalIds", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: fn(sql`'[]'::json`),
						notNull: true,
					}),
					col("taxes", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: fn(sql`'[]'::json`),
						notNull: true,
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("totalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditCardImportItem_pkey" })],
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isFullySynced", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isPaid", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("manualTotalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("paidAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						default: fn(sql`0`),
						notNull: true,
					}),
					col("statementDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("totalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						default: fn(sql`0`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditCardStatement_pkey" })],
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.createTable({
				columns: [
					col("chargeId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("installmentId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("refundId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("requiresRefundReview", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditEntryReference_pkey" })],
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
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
					col("statementDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["purchaseId", "number"], { name: "CreditInstallmentPlan_pkey" })],
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
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
					col("isSettled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("number", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("occurrenceDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
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
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditInstallmentRecord_pkey" })],
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
				],
				constraints: [primaryKey(["id"], { name: "CreditPurchaseHistory_pkey" })],
				schema: "public",
				table: "CreditPurchaseHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["externalId"], { name: "CreditPurchaseImportIdentity_pkey" })],
				schema: "public",
				table: "CreditPurchaseImportIdentity",
			}),
			this.createTable({
				columns: [
					col("bookingCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
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
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("exchangeRate", "numeric(24,12)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 24, scale: 12 } },
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("feeAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("feeDescription", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
					}),
					col("fees", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: fn(sql`'[]'::json`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("originalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("purchaseDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("recurrenceOccurrenceDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("refinancingFeeAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("totalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
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
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("canceledInstallmentNumbers", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("cancellationEligible", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
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
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditRefundRecord_pkey" })],
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.createTable({
				columns: [
					col("approvedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("original", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditRefundReview_pkey" })],
				schema: "public",
				table: "CreditRefundReview",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("chargeDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("isSettled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("settledByPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "CreditStatementCharge_pkey" })],
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("effectiveFrom", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("effectiveUntil", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("source", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						notNull: true,
					}),
					col("sourceVersion", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "CurrencyCountryAssociation",
			}),
			this.createTable({
				columns: [
					col("baseCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("fetchedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("rates", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
				],
				constraints: [primaryKey(["date", "baseCurrency"], { name: "CurrencyRateSnapshot_pkey" })],
				schema: "public",
				table: "CurrencyRateSnapshot",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("recipientId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("requesterId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("respondedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("status", '"DebtConnectionStatus"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "DebtConnectionStatus" } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtConnection_pkey" })],
				schema: "public",
				table: "DebtConnection",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("connectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("createdByUserId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("debtPersonId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("description", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("effect", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("kind", '"DebtEventKind"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "DebtEventKind" } },
						default: lit("ORIGIN"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtEvent_pkey" })],
				schema: "public",
				table: "DebtEvent",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("eventId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("hiddenAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtEventVisibility_pkey" })],
				schema: "public",
				table: "DebtEventVisibility",
			}),
			this.createTable({
				columns: [
					col("connectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("hiddenAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("normalizedName", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtPerson_pkey" })],
				schema: "public",
				table: "DebtPerson",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("eventId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isCreator", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtPurchaseLink_pkey" })],
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardImportItemId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("creditPurchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("mode", '"DebtSplitMode"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "DebtSplitMode" } },
						notNull: true,
					}),
					col("ownerIncluded", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("ownerShares", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("remainderDebtPersonId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("transactionImportItemId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtSplit_pkey" })],
				schema: "public",
				table: "DebtSplit",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("debtPersonId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("debtSplitId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("description", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("fixedAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("percentage", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
					}),
					col("shares", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("sortOrder", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtSplitParticipant_pkey" })],
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("eventId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isCreator", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "DebtTransactionLink_pkey" })],
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("entityId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("entityType", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("kind", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,8)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 8 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("yieldPeriod", "character varying(8)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 8 } },
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.createTable({
				columns: [
					col("balance", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						default: fn(sql`0`),
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("historicalYieldSettings", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("isDefaultForStatements", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isHidden", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isPrimary", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("legacyInstitutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("legacyYieldCalendar", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("name", "character varying(70)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 70 } },
					}),
					col("transferredProfileContext", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("type", '"FinancialAccountType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "FinancialAccountType" } },
						default: lit("CHECKING"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("yieldFixedRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldPeriod", '"FinancialAccountYieldPeriod"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldPeriod" },
						},
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceType", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
					}),
					col("yieldTaxIds", "character varying(36)[]", {
						codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
						default: lit([]),
						notNull: true,
					}),
					col("yieldTaxRate", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "Account_pkey" }),
					checkExpression(
						"FinancialAccount_yieldTaxIds_elem_not_null_6844033d",
						sql`array_position("yieldTaxIds", NULL) IS NULL`,
					),
				],
				schema: "public",
				table: "FinancialAccount",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,8)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 8 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isExcluded", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isHidden", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("kind", '"FinancialAccountYieldKind"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldKind" },
						},
						notNull: true,
					}),
					col("origin", '"FinancialAccountYieldOrigin"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldOrigin" },
						},
						default: lit("USER"),
						notNull: true,
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "FinancialAccountYield_pkey" })],
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "FinancialAccountYieldHoliday_pkey" })],
				schema: "public",
				table: "FinancialAccountYieldHoliday",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("effectiveDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("yieldFixedRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldPeriod", '"FinancialAccountYieldPeriod"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldPeriod" },
						},
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceType", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
					}),
					col("yieldTaxIds", "character varying(36)[]", {
						codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
						default: lit([]),
						notNull: true,
					}),
					col("yieldTaxRate", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "FinancialAccountYieldRateHistory_pkey" }),
					checkExpression(
						"FinancialAccountYieldRateHistory_yieldTaxIds_elem_not__6844033d",
						sql`array_position("yieldTaxIds", NULL) IS NULL`,
					),
				],
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("kind", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("series", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("startDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialHistoryCollection",
			}),
			this.createTable({
				columns: [
					col("collectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("unitId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["collectionId", "unitId"])],
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("completedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("generation", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("kind", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("lastError", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
					}),
					col("nextAttemptAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
					}),
					col("series", "character varying(10)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 10 } },
						notNull: true,
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("state", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createTable({
				columns: [
					col("accountCurrenciesByCountry", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: fn(sql`'{}'::json`),
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardRules", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("creditInstallmentRemainderOnFirst", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("creditRefundPolicy", '"CreditRefundPolicy"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "CreditRefundPolicy" } },
					}),
					col("creditStatementClosingInclusive", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("normalizedName", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("operatingCountryCodes", "character varying(2)[]", {
						codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 2 } },
						default: lit([]),
						notNull: true,
					}),
					col("status", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						default: lit("LEGACY_PRIVATE"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("version", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(1),
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "FinancialInstitution_pkey" }),
					checkExpression(
						"FinancialInstitution_operatingCountryCodes_elem_not_nu_49201499",
						sql`array_position("operatingCountryCodes", NULL) IS NULL`,
					),
				],
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardRules", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("isDefault", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
			this.createTable({
				columns: [
					col("authorId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("baseVersion", "int4", { codecRef: { codecId: "pg/int4@1" } }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("effectiveDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("kind", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						notNull: true,
					}),
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("reason", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("reviewedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("reviewerId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createTable({
				columns: [
					col("accountType", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					}),
					col("effectiveDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("effectiveUntil", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("financialInstitutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("profileId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("APPROVED"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("yieldPeriod", '"FinancialAccountYieldPeriod"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "FinancialAccountYieldPeriod" },
						},
					}),
					col("yieldTaxIds", "character varying(36)[]", {
						codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
						default: lit([]),
						notNull: true,
					}),
					col("yieldTaxRate", "numeric(5,2)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 2 } },
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "FinancialInstitutionYieldPolicy_pkey" }),
					checkExpression(
						"FinancialInstitutionYieldPolicy_yieldTaxIds_elem_not_n_6844033d",
						sql`array_position("yieldTaxIds", NULL) IS NULL`,
					),
				],
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("financialYieldPolicyId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("position", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("upToBalance", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("yieldFixedRate", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferencePercentage", "numeric(7,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 7, scale: 4 } },
					}),
					col("yieldReferenceType", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "FinancialInstitutionYieldRule_pkey" })],
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			this.createTable({
				columns: [
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz-date@1", typeParams: { precision: 3 } },
					}),
					col("provider", "character varying(40)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 40 } },
						notNull: true,
					}),
					col("slot", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
				],
				constraints: [primaryKey(["provider", "slot"])],
				schema: "public",
				table: "FinancialProviderSlot",
			}),
			this.createTable({
				columns: [
					col("batchId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("error", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("fileBytes", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("fileName", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("fileType", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("finishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("ignoredCount", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("importId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("kind", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("ordinal", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
					col("password", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("provider", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("scopeId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("statementId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("status", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("workerToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "ImportFileJob_pkey" })],
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createTable({
				columns: [
					col("action", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("payload", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("proposalId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("reviewerId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.createTable({
				columns: [
					col("amortization", '"AmortizationType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "AmortizationType" } },
						default: lit("PRICE"),
						notNull: true,
					}),
					col("contractBook", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("description", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
					}),
					col("dueDay", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("firstDueDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("installmentAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("interestRate", "numeric(5,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 5, scale: 4 } },
						notNull: true,
					}),
					col("lender", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("principalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("totalInstallments", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "Loan_pkey" })],
				schema: "public",
				table: "Loan",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("loanId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
				],
				constraints: [primaryKey(["id"], { name: "LoanHistory_pkey" })],
				schema: "public",
				table: "LoanHistory",
			}),
			this.createTable({
				columns: [
					col("accountAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("accountCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					}),
					col("advanceType", '"AdvanceType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "AdvanceType" } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dueDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("id", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("installmentNumber", "int2", { codecRef: { codecId: "pg/int2@1" }, notNull: true }),
					col("interestPaid", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("isAdvanced", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("loanId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("paidDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("principalPaid", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("totalPaid", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "LoanPayment_pkey" })],
				schema: "public",
				table: "LoanPayment",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(150)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 150 } },
						notNull: true,
					}),
					col("parameters", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("summary", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
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
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("categoryId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("endMonth", "character varying(7)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 7 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("parentBudgetId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("source", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("startMonth", "character varying(7)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 7 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "MonthlyBudget_pkey" })],
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("channel", "character varying(12)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("destinationKey", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("deviceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("event", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("lastError", "character varying(500)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 500 } },
					}),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("nextAttemptAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("status", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("transferId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createTable({
				columns: [
					col("connectionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("paused", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceBinding_pkey" })],
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("encryptedCredentials", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("lastQueriedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["userId"], { name: "OpenFinanceConfig_pkey" })],
				schema: "public",
				table: "OpenFinanceConfig",
			}),
			this.createTable({
				columns: [
					col("bankName", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("bankUpdatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("itemId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("remoteAccounts", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("status", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceConnection_pkey" })],
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.createTable({
				columns: [
					col("externalId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("recordId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["userId", "remoteAccountId", "externalId"], {
						name: "OpenFinanceIdentity_pkey",
					}),
				],
				schema: "public",
				table: "OpenFinanceIdentity",
			}),
			this.createTable({
				columns: [
					col("appliedSnapshot", "json", { codecRef: { codecId: "pg/json@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("identity", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("importId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("localId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("localKind", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("remoteAccountId", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("reviewItemId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("snapshot", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("state", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceRecord_pkey" })],
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.createTable({
				columns: [
					col("errors", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: lit("[]"),
						notNull: true,
					}),
					col("finishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("imported", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("linked", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("pending", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("processed", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("startedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("status", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("workerToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["id"], { name: "OpenFinanceRun_pkey" })],
				schema: "public",
				table: "OpenFinanceRun",
			}),
			this.createTable({
				columns: [
					col("aggregateId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("aggregateType", "character varying(80)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 80 } },
						notNull: true,
					}),
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("correlationId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("eventType", "character varying(120)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 120 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("lastError", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("occurredAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						notNull: true,
					}),
					col("payload", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: lit("{}"),
						notNull: true,
					}),
					col("publishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("schemaVersion", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(1),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userIds", "character varying(36)[]", {
						codecRef: { codecId: "sql/varchar@1", many: true, typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "OutboxEvent_pkey" }),
					checkExpression(
						"OutboxEvent_userIds_elem_not_null_ca18f62d",
						sql`array_position("userIds", NULL) IS NULL`,
					),
				],
				schema: "public",
				table: "OutboxEvent",
			}),
			this.createTable({
				columns: [
					col("address", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("credentials", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("enabled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("platform", "character varying(12)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "PushDevice",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("creditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("dayOfMonth", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("dayOfWeek", "int2", { codecRef: { codecId: "pg/int2@1" } }),
					col("destinationFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("installments", "int2", {
						codecRef: { codecId: "pg/int2@1" },
						default: lit(1),
						notNull: true,
					}),
					col("interval", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(1),
						notNull: true,
					}),
					col("isActive", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("materializedThrough", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						default: fn(sql`(CURRENT_DATE - 1)`),
						notNull: true,
					}),
					col("movement", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("originFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("unit", "character varying(5)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 5 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "Recurrence_pkey" })],
				schema: "public",
				table: "Recurrence",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "RecurrenceHistory_pkey" })],
				schema: "public",
				table: "RecurrenceHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("deletedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("purchaseId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
				],
				constraints: [primaryKey(["recurrenceId", "date"], { name: "RecurrenceOccurrence_pkey" })],
				schema: "public",
				table: "RecurrenceOccurrence",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("type", '"ReferenceRateType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "ReferenceRateType" } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("value", "numeric(12,8)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 8 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "ReferenceRate_pkey" })],
				schema: "public",
				table: "ReferenceRate",
			}),
			this.createTable({
				columns: [
					col("conversionAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("conversionCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("conversionPoints", "numeric(18,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 18, scale: 4 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("initialBalance", "numeric(18,4)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 18, scale: 4 } },
						notNull: true,
					}),
					col("kind", '"RewardsAccountKind"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "RewardsAccountKind" } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "RewardsAccount_pkey" })],
				schema: "public",
				table: "RewardsAccount",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("normalizedName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "Store_pkey" })],
				schema: "public",
				table: "Store",
			}),
			this.createTable({
				columns: [
					col("categoryId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("entityId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("entityType", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TagAssignment_pkey" })],
				schema: "public",
				table: "TagAssignment",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("bookingCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("conversionSource", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						default: lit("DAILY"),
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("description", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("destinationAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("destinationCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					}),
					col("destinationFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("exchangeRate", "numeric(24,12)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 24, scale: 12 } },
					}),
					col("fees", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: fn(sql`'[]'::json`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isHidden", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("originFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("originalAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("paymentAmount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("paymentCreditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("paymentCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					}),
					col("recurrenceId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("recurrenceOccurrenceDate", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("type", '"TransactionType"', {
						codecRef: { codecId: "pg/enum@1", typeParams: { typeName: "TransactionType" } },
						default: lit("EXPENSE"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "Transaction_pkey" })],
				schema: "public",
				table: "Transaction",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionExternalReference_pkey" })],
				schema: "public",
				table: "TransactionExternalReference",
			}),
			this.createTable({
				columns: [
					col("changedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("field", "character varying(50)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 50 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("newValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("oldValue", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("transactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionHistory_pkey" })],
				schema: "public",
				table: "TransactionHistory",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("fileName", "character varying(255)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 255 } },
						notNull: true,
					}),
					col("financialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("periodEnd", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("periodStart", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("provider", '"TransactionImportProvider"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "TransactionImportProvider" },
						},
						notNull: true,
					}),
					col("status", '"TransactionImportStatus"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "TransactionImportStatus" },
						},
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionImport_pkey" })],
				schema: "public",
				table: "TransactionImport",
			}),
			this.createTable({
				columns: [
					col("amount", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
						notNull: true,
					}),
					col("balanceAfter", "numeric(20,6)", {
						codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						default: lit("BRL"),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("description", "character varying(1000)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1000 } },
					}),
					col("destinationFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("externalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("isDuplicateIgnored", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isHidden", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isReconciled", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("isSelected", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("originFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("paymentCreditCardId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("reconciledImportItemId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("reconciledTransactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("storeName", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("time", "time(3)", {
						codecRef: { codecId: "pg/time-string@1", typeParams: { precision: 3 } },
					}),
					col("transactionImportId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("transferCounterpartExternalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
					}),
					col("type", '"TransactionImportItemType"', {
						codecRef: {
							codecId: "pg/enum@1",
							typeParams: { typeName: "TransactionImportItemType" },
						},
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionImportItem_pkey" })],
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("incomingExternalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("incomingFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("outgoingExternalId", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("outgoingFinancialAccountId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [
					primaryKey(["id"], { name: "TransactionImportTransferSuggestionRejection_pkey" }),
				],
				schema: "public",
				table: "TransactionImportTransferSuggestionRejection",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("firstTransactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("secondTransactionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "TransactionTransferSuggestionRejection_pkey" })],
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("globalRulesFrom", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("institutionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("effectiveDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("linkId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("profileId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.createTable({
				columns: [
					col("code", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["code"])],
				schema: "public",
				table: "YieldCalendarCountry",
			}),
			this.createTable({
				columns: [
					col("confirmedBy", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("generatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("source", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						notNull: true,
					}),
					col("sourceVersion", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
						notNull: true,
					}),
					col("status", "character varying(24)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 24 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("year", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
				],
				constraints: [primaryKey(["countryCode", "year"])],
				schema: "public",
				table: "YieldCalendarCoverage",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("currency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("effectiveFrom", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("effectiveUntil", "date", { codecRef: { codecId: "pg/date-string@1" } }),
					col("source", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						default: lit("ADMIN"),
						notNull: true,
					}),
					col("sourceVersion", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
					}),
				],
				constraints: [primaryKey(["countryCode", "currency"])],
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.createTable({
				columns: [
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.createTable({
				columns: [
					col("action", "character varying(16)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 16 } },
						notNull: true,
					}),
					col("countryCode", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date-string@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			this.createTable({
				columns: [
					col("accessToken", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("accessTokenExpiresAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("accountId", "character varying(320)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 320 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("idToken", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("issuer", "character varying(320)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 320 } },
						notNull: true,
					}),
					col("password", "character varying(255)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 255 } },
					}),
					col("providerId", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("refreshToken", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("refreshTokenExpiresAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
					}),
					col("scope", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "account_pkey" })],
				schema: "public",
				table: "account",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("expiresAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("ipAddress", "character varying(64)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 64 } },
					}),
					col("token", "character varying(512)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 512 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("userAgent", "character varying(1024)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 1024 } },
					}),
					col("userId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "session_pkey" })],
				schema: "public",
				table: "session",
			}),
			this.createTable({
				columns: [
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("isActive", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(true),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "taxDefinition",
			}),
			this.createTable({
				columns: [
					col("applicationOrder", "int4", { codecRef: { codecId: "pg/int4@1" }, notNull: true }),
					col("brackets", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("effectiveDate", "date", {
						codecRef: { codecId: "pg/date-string@1" },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("taxDefinitionId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("email", "character varying(320)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 320 } },
						notNull: true,
					}),
					col("emailVerified", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("image", "character varying(2048)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2048 } },
					}),
					col("invoicePaymentTiming", "character varying(12)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 12 } },
						default: lit("DUE_DATE"),
						notNull: true,
					}),
					col("name", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
						notNull: true,
					}),
					col("preferredCountry", "character varying(2)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 2 } },
					}),
					col("preferredCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					}),
					col("preferredTimeZone", "character varying(100)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 100 } },
					}),
					col("role", "character varying(10)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 10 } },
						default: lit("USER"),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"], { name: "User_pkey" })],
				schema: "public",
				table: "user",
			}),
			this.createTable({
				columns: [
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("expiresAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn(sql`cuid2()`),
						notNull: true,
					}),
					col("identifier", "character varying(320)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 320 } },
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp-date@1", typeParams: { precision: 3 } },
						default: fn(sql`now()`),
						notNull: true,
					}),
					col("value", "text", { codecRef: { codecId: "pg/text@1" }, notNull: true }),
				],
				constraints: [primaryKey(["id"], { name: "verification_pkey" })],
				schema: "public",
				table: "verification",
			}),
			this.addUnique({
				columns: ["transferId", "accountId"],
				constraint: "AccountTransferItem_transferId_accountId_key",
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.addUnique({
				columns: ["chargeId"],
				constraint: "CreditEntryReference_chargeId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["installmentId"],
				constraint: "CreditEntryReference_installmentId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["refundId"],
				constraint: "CreditEntryReference_refundId_key",
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addUnique({
				columns: ["externalId"],
				constraint: "CreditRefundRecord_externalId_key",
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addUnique({
				columns: ["externalId"],
				constraint: "CreditStatementCharge_externalId_key",
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addUnique({
				columns: ["creditCardImportItemId"],
				constraint: "DebtSplit_creditCardImportItemId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["creditPurchaseId"],
				constraint: "DebtSplit_creditPurchaseId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["recurrenceId"],
				constraint: "DebtSplit_recurrenceId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["transactionId"],
				constraint: "DebtSplit_transactionId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["transactionImportItemId"],
				constraint: "DebtSplit_transactionImportItemId_key",
				schema: "public",
				table: "DebtSplit",
			}),
			this.addUnique({
				columns: ["entityType", "entityId"],
				constraint: "DetachedFinancialRecord_entityType_entityId_key",
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.addUnique({
				columns: ["deduplicationKey"],
				constraint: "FinancialHistoryCollection_deduplicationKey_key",
				schema: "public",
				table: "FinancialHistoryCollection",
			}),
			this.addUnique({
				columns: ["deduplicationKey"],
				constraint: "FinancialHistoryUnit_deduplicationKey_key",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.addUnique({
				columns: ["institutionId", "name"],
				constraint: "FinancialInstitutionProfile_institutionId_name_key",
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
			this.addUnique({
				columns: ["transferId", "event", "destinationKey"],
				constraint: "NotificationDelivery_transferId_event_destinationKey_key",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addUnique({
				columns: ["address"],
				constraint: "PushDevice_address_key",
				schema: "public",
				table: "PushDevice",
			}),
			this.addUnique({
				columns: ["financialAccountId"],
				constraint: "RewardsAccount_financialAccountId_key",
				schema: "public",
				table: "RewardsAccount",
			}),
			this.addUnique({
				columns: ["userId", "institutionId"],
				constraint: "UserFinancialInstitution_userId_institutionId_key",
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addUnique({
				columns: ["linkId", "effectiveDate"],
				constraint: "UserInstitutionProfileChange_linkId_effectiveDate_key",
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addUnique({
				columns: ["countryCode", "date"],
				constraint: "YieldCalendarOverride_countryCode_date_key",
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			this.addUnique({
				columns: ["taxDefinitionId", "effectiveDate"],
				constraint: "taxDefinitionVersion_taxDefinitionId_effectiveDate_key",
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.createIndex({
				columns: ["recipientId", "status", "createdAt"],
				index: "AccountTransfer_recipientId_status_createdAt_idx_163556a6",
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createIndex({
				columns: ["senderId", "status", "createdAt"],
				index: "AccountTransfer_senderId_status_createdAt_idx_1751b28b",
				schema: "public",
				table: "AccountTransfer",
			}),
			this.createIndex({
				columns: ["accountId"],
				index: "AccountTransferItem_accountId_idx_cbfb3085",
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.createIndex({
				columns: ["userId", "readAt", "createdAt"],
				index: "AppNotification_userId_readAt_createdAt_idx_9b6c3810",
				schema: "public",
				table: "AppNotification",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "ApplicationUpgradeArchive_user_idx",
				schema: "public",
				table: "ApplicationUpgradeArchive",
			}),
			this.createIndex({
				columns: ["recurrenceId"],
				index: "ApplicationUpgradeRecurrence_destination_idx",
				schema: "public",
				table: "ApplicationUpgradeRecurrence",
			}),
			this.createIndex({
				columns: ["userId", "financialAccountId", "date"],
				extras: { unique: true },
				index: "BalanceAdjustment_userId_account_date_key",
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.createIndex({
				columns: ["userId", "name"],
				extras: { unique: true },
				index: "Category_userId_name_key",
				schema: "public",
				table: "Category",
			}),
			this.createIndex({
				columns: ["completedAt", "createdAt"],
				index: "ConsumerReceipt_cleanup_idx",
				schema: "public",
				table: "ConsumerReceipt",
			}),
			this.createIndex({
				columns: ["creditCardId"],
				index: "CreditBookTombstone_creditCardId_idx",
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "CreditBookTombstone_userId_idx",
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.createIndex({
				columns: ["financialAccountId"],
				extras: { unique: true },
				index: "CreditCard_accountId_key",
				schema: "public",
				table: "CreditCard",
			}),
			this.createIndex({
				columns: ["cashbackAccountId"],
				index: "CreditCard_cashbackAccountId_idx",
				schema: "public",
				table: "CreditCard",
			}),
			this.createIndex({
				columns: ["paymentAccountId"],
				index: "CreditCard_paymentAccountId_idx",
				schema: "public",
				table: "CreditCard",
			}),
			this.createIndex({
				columns: ["creditCardId"],
				index: "CreditCardImport_creditCardId_idx",
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createIndex({
				columns: ["userId", "status", "createdAt"],
				index: "CreditCardImport_userId_status_createdAt_idx",
				schema: "public",
				table: "CreditCardImport",
			}),
			this.createIndex({
				columns: ["externalId"],
				index: "CreditCardImportItem_externalId_idx",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createIndex({
				columns: ["creditCardImportId", "purchaseDate"],
				index: "CreditCardImportItem_importId_purchaseDate_idx",
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.createIndex({
				columns: ["creditCardId", "statementDate"],
				extras: { unique: true },
				index: "CreditCardStatement_creditCardId_statementDate_key",
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.createIndex({
				columns: ["purchaseId"],
				index: "CreditEntryReference_purchaseId_idx",
				schema: "public",
				table: "CreditEntryReference",
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
				columns: ["purchaseId"],
				index: "CreditPurchaseImportIdentity_purchaseId_idx",
				schema: "public",
				table: "CreditPurchaseImportIdentity",
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
				columns: ["recurrenceId", "recurrenceOccurrenceDate"],
				extras: { unique: true },
				index: "CreditPurchaseRecord_recurrence_occurrence_key",
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
				columns: ["userId", "creditCardId", "approvedAt"],
				index: "CreditRefundReview_owner_card_pending_idx",
				schema: "public",
				table: "CreditRefundReview",
			}),
			this.createIndex({
				columns: ["statementId", "chargeDate"],
				index: "CreditStatementCharge_statement_date_idx",
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.createIndex({
				columns: ["currency", "countryCode"],
				index: "CurrencyCountryAssociation_currency_countryCode_idx_c16d675b",
				schema: "public",
				table: "CurrencyCountryAssociation",
			}),
			this.createIndex({
				columns: ["recipientId", "status"],
				index: "DebtConnection_recipientId_status_idx",
				schema: "public",
				table: "DebtConnection",
			}),
			this.createIndex({
				columns: ["requesterId", "recipientId"],
				extras: { unique: true },
				index: "DebtConnection_requesterId_recipientId_key",
				schema: "public",
				table: "DebtConnection",
			}),
			this.createIndex({
				columns: ["connectionId", "date", "id"],
				index: "DebtEvent_connectionId_date_id_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["createdByUserId"],
				index: "DebtEvent_createdByUserId_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["debtPersonId", "date", "id"],
				index: "DebtEvent_debtPersonId_date_id_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["eventId", "userId"],
				extras: { unique: true },
				index: "DebtEventVisibility_eventId_userId_key",
				schema: "public",
				table: "DebtEventVisibility",
			}),
			this.createIndex({
				columns: ["userId", "hiddenAt"],
				index: "DebtEventVisibility_userId_hiddenAt_idx",
				schema: "public",
				table: "DebtEventVisibility",
			}),
			this.createIndex({
				columns: ["connectionId"],
				index: "DebtPerson_connectionId_idx",
				schema: "public",
				table: "DebtPerson",
			}),
			this.createIndex({
				columns: ["userId", "hiddenAt", "name", "id"],
				index: "DebtPerson_userId_hiddenAt_name_id_idx",
				schema: "public",
				table: "DebtPerson",
			}),
			this.createIndex({
				columns: ["userId", "normalizedName"],
				extras: { unique: true },
				index: "DebtPerson_userId_normalizedName_key",
				schema: "public",
				table: "DebtPerson",
			}),
			this.createIndex({
				columns: ["creditPurchaseId"],
				index: "DebtPurchaseLink_creditPurchaseId_idx",
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.createIndex({
				columns: ["eventId", "userId"],
				extras: { unique: true },
				index: "DebtPurchaseLink_eventId_userId_key",
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.createIndex({
				columns: ["remainderDebtPersonId"],
				index: "DebtSplit_remainderDebtPersonId_idx",
				schema: "public",
				table: "DebtSplit",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "DebtSplit_userId_idx",
				schema: "public",
				table: "DebtSplit",
			}),
			this.createIndex({
				columns: ["debtPersonId"],
				index: "DebtSplitParticipant_debtPersonId_idx",
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.createIndex({
				columns: ["debtSplitId", "debtPersonId"],
				extras: { unique: true },
				index: "DebtSplitParticipant_debtSplitId_debtPersonId_key",
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.createIndex({
				columns: ["debtSplitId", "sortOrder"],
				extras: { unique: true },
				index: "DebtSplitParticipant_debtSplitId_sortOrder_key",
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.createIndex({
				columns: ["eventId", "userId"],
				extras: { unique: true },
				index: "DebtTransactionLink_eventId_userId_key",
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.createIndex({
				columns: ["transactionId"],
				index: "DebtTransactionLink_transactionId_idx",
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "DetachedFinancialRecord_userId_idx_a489d58a",
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.createIndex({
				columns: ["financialAccountId", "date"],
				index: "DetachedRewardCredit_financialAccountId_date_idx_de4be8dd",
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "FinancialAccount_institutionId_idx",
				schema: "public",
				table: "FinancialAccount",
			}),
			this.createIndex({
				columns: ["userId", "institutionId", "name", "type"],
				extras: { unique: true },
				index: "FinancialAccount_userId_institutionId_name_type_key",
				schema: "public",
				table: "FinancialAccount",
			}),
			this.createIndex({
				columns: ["financialAccountId", "date"],
				extras: { unique: true },
				index: "FinancialAccountYield_accountId_date_key",
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.createIndex({
				columns: ["externalId"],
				index: "FinancialAccountYield_externalId_idx",
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.createIndex({
				columns: ["userId", "date"],
				extras: { unique: true },
				index: "FinancialAccountYieldHoliday_userId_date_key",
				schema: "public",
				table: "FinancialAccountYieldHoliday",
			}),
			this.createIndex({
				columns: ["financialAccountId", "effectiveDate"],
				extras: { unique: true },
				index: "FinancialAccountYieldRateHistory_accountId_effectiveDate_key",
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.createIndex({
				columns: ["collectionId"],
				index: "FinancialHistoryCollectionUnit_collectionId_idx_b344fc1a",
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createIndex({
				columns: ["unitId"],
				index: "FinancialHistoryCollectionUnit_unit_idx",
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.createIndex({
				columns: ["kind", "series", "startDate", "endDate"],
				index: "FinancialHistoryUnit_coverage_idx",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createIndex({
				columns: ["state", "nextAttemptAt", "lockedUntil"],
				index: "FinancialHistoryUnit_recovery_idx",
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createIndex({
				columns: ["userId", "normalizedName"],
				extras: { unique: true },
				index: "FinancialInstitution_userId_normalizedName_key",
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.createIndex({
				columns: ["authorId"],
				index: "FinancialInstitutionProposal_authorId_idx_e47547ed",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "FinancialInstitutionProposal_institutionId_idx_bab0e331",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["reviewerId"],
				index: "FinancialInstitutionProposal_reviewerId_idx_25a27b4e",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["status", "createdAt"],
				index: "FinancialInstitutionProposal_status_createdAt_idx_58610442",
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.createIndex({
				columns: ["financialInstitutionId", "effectiveDate"],
				index: "FinancialInstitutionYieldPolicy_institutionId_effectiveDate_idx",
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.createIndex({
				columns: ["profileId", "countryCode", "currency", "effectiveDate"],
				index: "InstitutionPolicy_scope_date_idx",
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
			this.createIndex({
				columns: ["userId", "batchId", "ordinal"],
				index: "ImportFileJob_batch_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["status", "lockedUntil"],
				index: "ImportFileJob_recovery_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["kind", "scopeId", "status", "createdAt"],
				index: "ImportFileJob_scope_idx",
				schema: "public",
				table: "ImportFileJob",
			}),
			this.createIndex({
				columns: ["proposalId"],
				index: "InstitutionReviewAudit_proposalId_idx_2f5df372",
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.createIndex({
				columns: ["reviewerId"],
				index: "InstitutionReviewAudit_reviewerId_idx_25a27b4e",
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "Loan_institutionId_idx",
				schema: "public",
				table: "Loan",
			}),
			this.createIndex({
				columns: ["userId", "startDate", "id"],
				index: "Loan_userId_startDate_id_idx",
				schema: "public",
				table: "Loan",
			}),
			this.createIndex({
				columns: ["loanId", "changedAt", "id"],
				index: "LoanHistory_loanId_changedAt_id_idx",
				schema: "public",
				table: "LoanHistory",
			}),
			this.createIndex({
				columns: ["loanId", "installmentNumber"],
				extras: { unique: true },
				index: "LoanPayment_loanId_installmentNumber_key",
				schema: "public",
				table: "LoanPayment",
			}),
			this.createIndex({
				columns: ["loanId", "paidDate"],
				index: "LoanPayment_loanId_paidDate_idx",
				schema: "public",
				table: "LoanPayment",
			}),
			this.createIndex({
				columns: ["userId", "updatedAt", "id"],
				index: "LoanScenario_userId_updatedAt_id_idx",
				schema: "public",
				table: "LoanScenario",
			}),
			this.createIndex({
				columns: ["categoryId"],
				index: "MonthlyBudget_categoryId_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["parentBudgetId"],
				index: "MonthlyBudget_parentBudgetId_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["userId", "startMonth"],
				index: "MonthlyBudget_userId_startMonth_idx",
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.createIndex({
				columns: ["status", "nextAttemptAt"],
				index: "NotificationDelivery_status_nextAttemptAt_idx_8ba20615",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "NotificationDelivery_userId_idx_a489d58a",
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.createIndex({
				columns: ["connectionId", "remoteAccountId"],
				extras: { unique: true },
				index: "OpenFinanceBinding_connection_account_key",
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.createIndex({
				columns: ["userId", "itemId"],
				extras: { unique: true },
				index: "OpenFinanceConnection_user_item_key",
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.createIndex({
				columns: ["userId", "remoteAccountId", "identity"],
				extras: { unique: true },
				index: "OpenFinanceRecord_identity_key",
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.createIndex({
				columns: ["userId", "startedAt"],
				index: "OpenFinanceRun_user_started_idx",
				schema: "public",
				table: "OpenFinanceRun",
			}),
			this.createIndex({
				columns: ["aggregateType", "aggregateId", "occurredAt"],
				index: "OutboxEvent_aggregate_idx",
				schema: "public",
				table: "OutboxEvent",
			}),
			this.createIndex({
				columns: ["publishedAt", "lockedUntil", "occurredAt", "id"],
				index: "OutboxEvent_pending_idx",
				schema: "public",
				table: "OutboxEvent",
			}),
			this.createIndex({
				columns: ["userId", "enabled"],
				index: "PushDevice_userId_enabled_idx_9da2f9d3",
				schema: "public",
				table: "PushDevice",
			}),
			this.createIndex({
				columns: ["userId", "isActive", "name", "id"],
				index: "Recurrence_user_active_name_idx",
				schema: "public",
				table: "Recurrence",
			}),
			this.createIndex({
				columns: ["recurrenceId", "changedAt", "id"],
				index: "RecurrenceHistory_recurrence_date_idx",
				schema: "public",
				table: "RecurrenceHistory",
			}),
			this.createIndex({
				columns: ["type", "date"],
				extras: { unique: true },
				index: "ReferenceRate_type_date_key",
				schema: "public",
				table: "ReferenceRate",
			}),
			this.createIndex({
				columns: ["userId", "normalizedName"],
				extras: { unique: true },
				index: "Store_userId_normalizedName_key",
				schema: "public",
				table: "Store",
			}),
			this.createIndex({
				columns: ["categoryId", "entityType", "entityId"],
				extras: { unique: true },
				index: "TagAssignment_categoryId_entityType_entityId_key",
				schema: "public",
				table: "TagAssignment",
			}),
			this.createIndex({
				columns: ["entityType", "entityId"],
				index: "TagAssignment_entityType_entityId_idx",
				schema: "public",
				table: "TagAssignment",
			}),
			this.createIndex({
				columns: ["paymentCreditCardId"],
				index: "Transaction_paymentCreditCardId_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["recurrenceId", "recurrenceOccurrenceDate"],
				extras: { unique: true },
				index: "Transaction_recurrenceId_occurrenceDate_key",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["userId", "date", "createdAt", "id"],
				index: "Transaction_userId_date_createdAt_id_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["userId", "destinationFinancialAccountId", "date", "id"],
				index: "Transaction_userId_destination_date_id_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["userId", "originFinancialAccountId", "date", "id"],
				index: "Transaction_userId_origin_date_id_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["financialAccountId", "externalId"],
				extras: { unique: true },
				index: "TransactionExternalReference_accountId_externalId_key",
				schema: "public",
				table: "TransactionExternalReference",
			}),
			this.createIndex({
				columns: ["transactionId"],
				index: "TransactionExternalReference_transactionId_idx",
				schema: "public",
				table: "TransactionExternalReference",
			}),
			this.createIndex({
				columns: ["financialAccountId"],
				index: "TransactionImport_financialAccountId_idx",
				schema: "public",
				table: "TransactionImport",
			}),
			this.createIndex({
				columns: ["userId", "status", "createdAt"],
				index: "TransactionImport_userId_status_createdAt_idx",
				schema: "public",
				table: "TransactionImport",
			}),
			this.createIndex({
				columns: ["destinationFinancialAccountId"],
				index: "TransactionImportItem_destinationId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["externalId"],
				index: "TransactionImportItem_externalId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["transactionImportId", "date"],
				index: "TransactionImportItem_importId_date_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["originFinancialAccountId"],
				index: "TransactionImportItem_originId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["paymentCreditCardId"],
				index: "TransactionImportItem_paymentCreditCardId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["reconciledImportItemId"],
				index: "TransactionImportItem_reconciledImportItemId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["reconciledTransactionId"],
				index: "TransactionImportItem_reconciledTransactionId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: [
					"userId",
					"outgoingFinancialAccountId",
					"outgoingExternalId",
					"incomingFinancialAccountId",
					"incomingExternalId",
				],
				extras: { unique: true },
				index: "TransactionImportTransferSuggestionRejection_pair_key",
				schema: "public",
				table: "TransactionImportTransferSuggestionRejection",
			}),
			this.createIndex({
				columns: ["userId", "firstTransactionId", "secondTransactionId"],
				extras: { unique: true },
				index: "TransactionTransferSuggestionRejection_pair_key",
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.createIndex({
				columns: ["institutionId"],
				index: "UserFinancialInstitution_institutionId_idx_bab0e331",
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.createIndex({
				columns: ["profileId"],
				index: "UserInstitutionProfileChange_profileId_idx_d9cdfcaf",
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.createIndex({
				columns: ["currency"],
				index: "YieldCalendarCurrency_currency_idx_e37259ca",
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.createIndex({
				columns: ["countryCode", "date"],
				extras: { unique: true },
				index: "YieldCalendarHoliday_countryCode_date_idx_dc368468",
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.createIndex({
				columns: ["issuer", "accountId"],
				extras: { unique: true },
				index: "account_issuer_accountId_key",
				schema: "public",
				table: "account",
			}),
			this.createIndex({
				columns: ["providerId", "accountId"],
				extras: { unique: true },
				index: "account_providerId_accountId_key",
				schema: "public",
				table: "account",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "account_userId_idx",
				schema: "public",
				table: "account",
			}),
			this.createIndex({
				columns: ["token"],
				extras: { unique: true },
				index: "session_token_key",
				schema: "public",
				table: "session",
			}),
			this.createIndex({
				columns: ["userId"],
				index: "session_userId_idx",
				schema: "public",
				table: "session",
			}),
			this.createIndex({
				columns: ["taxDefinitionId"],
				index: "taxDefinitionVersion_taxDefinitionId_idx_987c13b3",
				schema: "public",
				table: "taxDefinitionVersion",
			}),
			this.createIndex({
				columns: ["email"],
				extras: { unique: true },
				index: "User_email_key",
				schema: "public",
				table: "user",
			}),
			this.createIndex({
				columns: ["identifier"],
				index: "verification_identifier_idx",
				schema: "public",
				table: "verification",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["senderId"],
					name: "AccountTransfer_senderId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AccountTransfer",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recipientId"],
					name: "AccountTransfer_recipientId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AccountTransfer",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transferId"],
					name: "AccountTransferItem_transferId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "AccountTransfer" },
				},
				schema: "public",
				table: "AccountTransferItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "AppNotification_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "AppNotification",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "BalanceAdjustment_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "BalanceAdjustment_financialAccountId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["parentId"],
					name: "Category_parentId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "Category",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Category_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Category",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditBookTombstone_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditBookTombstone_creditCardId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditBookTombstone",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "CreditCard_accountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditCard",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["paymentAccountId"],
					name: "CreditCard_paymentAccountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditCard",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["cashbackAccountId"],
					name: "CreditCard_cashbackAccountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditCard",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditCardHistory_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditCardHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditCardImport_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditCardImport_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardImportId"],
					name: "CreditCardImportItem_importId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardImport" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reconciledCreditPurchaseId"],
					name: "CreditCardImportItem_reconciledCreditPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditCardStatement_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditEntryReference_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["installmentId"],
					name: "CreditEntryReference_installmentId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditInstallmentRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["refundId"],
					name: "CreditEntryReference_refundId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditRefundRecord" },
				},
				schema: "public",
				table: "CreditEntryReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["chargeId"],
					name: "CreditEntryReference_chargeId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditStatementCharge" },
				},
				schema: "public",
				table: "CreditEntryReference",
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
					columns: ["settledByPurchaseId"],
					name: "CreditInstallmentRecord_settledByPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditInstallmentRecord",
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
					columns: ["creditPurchaseId"],
					name: "CreditPurchaseHistory_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "CreditPurchaseHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["purchaseId"],
					name: "CreditPurchaseImportIdentity_purchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditPurchaseImportIdentity",
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
					columns: ["cashbackAccountId"],
					name: "CreditPurchaseRecord_cashbackAccountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "CreditPurchaseRecord_recurrenceId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
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
					columns: ["userId"],
					name: "CreditRefundReview_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditRefundReview",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "CreditRefundReview_creditCardId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "CreditRefundReview",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["id"],
					name: "CreditRefundReview_id_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "CreditRefundReview",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["settledByPurchaseId"],
					name: "CreditStatementCharge_settledByPurchaseId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditPurchaseRecord" },
				},
				schema: "public",
				table: "CreditStatementCharge",
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
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "CurrencyCountryAssociation_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "CurrencyCountryAssociation",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["requesterId"],
					name: "DebtConnection_requesterId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtConnection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recipientId"],
					name: "DebtConnection_recipientId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtConnection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["debtPersonId"],
					name: "DebtEvent_debtPersonId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtPerson" },
				},
				schema: "public",
				table: "DebtEvent",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["connectionId"],
					name: "DebtEvent_connectionId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtConnection" },
				},
				schema: "public",
				table: "DebtEvent",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["createdByUserId"],
					name: "DebtEvent_createdByUserId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtEvent",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["eventId"],
					name: "DebtEventVisibility_eventId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtEvent" },
				},
				schema: "public",
				table: "DebtEventVisibility",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DebtEventVisibility_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtEventVisibility",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DebtPerson_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtPerson",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["connectionId"],
					name: "DebtPerson_connectionId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtConnection" },
				},
				schema: "public",
				table: "DebtPerson",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["eventId"],
					name: "DebtPurchaseLink_eventId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtEvent" },
				},
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditPurchaseId"],
					name: "DebtPurchaseLink_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DebtPurchaseLink_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtPurchaseLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DebtSplit_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["remainderDebtPersonId"],
					name: "DebtSplit_remainderDebtPersonId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtPerson" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionId"],
					name: "DebtSplit_transactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionImportItemId"],
					name: "DebtSplit_transactionImportItemId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "TransactionImportItem" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardImportItemId"],
					name: "DebtSplit_creditCardImportItemId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCardImportItem" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditPurchaseId"],
					name: "DebtSplit_creditPurchaseId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditEntryReference" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "DebtSplit_recurrenceId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "DebtSplit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["debtSplitId"],
					name: "DebtSplitParticipant_debtSplitId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtSplit" },
				},
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["debtPersonId"],
					name: "DebtSplitParticipant_debtPersonId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtPerson" },
				},
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["eventId"],
					name: "DebtTransactionLink_eventId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "DebtEvent" },
				},
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionId"],
					name: "DebtTransactionLink_transactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DebtTransactionLink_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DebtTransactionLink",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "DetachedFinancialRecord_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "DetachedFinancialRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "DetachedRewardCredit_financialAccountId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "DetachedRewardCredit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Account_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "FinancialAccount_institutionId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialAccount",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "FinancialAccountYield_financialAccountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "FinancialAccountYieldHoliday_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialAccountYieldHoliday",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "FinancialAccountYieldRateHistory_financialAccountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "FinancialAccountYieldRateHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["collectionId"],
					name: "FinancialHistoryCollectionUnit_collectionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialHistoryCollection" },
				},
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["unitId"],
					name: "FinancialHistoryCollectionUnit_unitId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialHistoryUnit" },
				},
				schema: "public",
				table: "FinancialHistoryCollectionUnit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "FinancialInstitution_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "FinancialInstitutionProfile_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialInstitutionProfile",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "FinancialInstitutionProposal_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["authorId"],
					name: "FinancialInstitutionProposal_authorId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reviewerId"],
					name: "FinancialInstitutionProposal_reviewerId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "FinancialInstitutionProposal",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["profileId"],
					name: "FinancialInstitutionYieldPolicy_profileId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProfile" },
				},
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
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
			this.addForeignKey({
				foreignKey: {
					columns: ["proposalId"],
					name: "InstitutionReviewAudit_proposalId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProposal" },
				},
				schema: "public",
				table: "InstitutionReviewAudit",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reviewerId"],
					name: "InstitutionReviewAudit_reviewerId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "InstitutionReviewAudit",
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
					name: "Loan_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Loan",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["loanId"],
					name: "LoanHistory_loanId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Loan" },
				},
				schema: "public",
				table: "LoanHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "LoanPayment_accountId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "LoanPayment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["loanId"],
					name: "LoanPayment_loanId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Loan" },
				},
				schema: "public",
				table: "LoanPayment",
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
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "MonthlyBudget_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["categoryId"],
					name: "MonthlyBudget_categoryId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["parentBudgetId"],
					name: "MonthlyBudget_parentBudgetId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "MonthlyBudget" },
				},
				schema: "public",
				table: "MonthlyBudget",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "NotificationDelivery_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transferId"],
					name: "NotificationDelivery_transferId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "AccountTransfer" },
				},
				schema: "public",
				table: "NotificationDelivery",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["connectionId"],
					name: "OpenFinanceBinding_connectionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "OpenFinanceConnection" },
				},
				schema: "public",
				table: "OpenFinanceBinding",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceConfig_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceConfig",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceConnection_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceConnection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recordId"],
					name: "OpenFinanceIdentity_recordId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "OpenFinanceRecord" },
				},
				schema: "public",
				table: "OpenFinanceIdentity",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceRecord_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceRecord",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "OpenFinanceRun_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "OpenFinanceRun",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "PushDevice_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "PushDevice",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Recurrence_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["originFinancialAccountId"],
					name: "Recurrence_origin_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["destinationFinancialAccountId"],
					name: "Recurrence_destination_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["creditCardId"],
					name: "Recurrence_card_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "RecurrenceHistory_recurrence_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "RecurrenceHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "RecurrenceOccurrence_recurrence_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "RecurrenceOccurrence",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "RewardsAccount_financialAccountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "RewardsAccount",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Store_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Store",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["categoryId"],
					name: "TagAssignment_categoryId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Category" },
				},
				schema: "public",
				table: "TagAssignment",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["paymentCreditCardId"],
					name: "Transaction_paymentCreditCardId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "Transaction",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["destinationFinancialAccountId"],
					name: "Transaction_destinationId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Transaction",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["originFinancialAccountId"],
					name: "Transaction_originId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "Transaction",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["recurrenceId"],
					name: "Transaction_recurrenceId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Recurrence" },
				},
				schema: "public",
				table: "Transaction",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "Transaction_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "Transaction",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionId"],
					name: "TransactionExternalReference_transactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionExternalReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "TransactionExternalReference_financialAccountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionExternalReference",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionId"],
					name: "TransactionHistory_transactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionHistory",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "TransactionImport_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "TransactionImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["financialAccountId"],
					name: "TransactionImport_financialAccountId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionImport",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["transactionImportId"],
					name: "TransactionImportItem_importId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "TransactionImport" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["paymentCreditCardId"],
					name: "TransactionImportItem_paymentCreditCardId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["originFinancialAccountId"],
					name: "TransactionImportItem_originId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["destinationFinancialAccountId"],
					name: "TransactionImportItem_destinationId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reconciledTransactionId"],
					name: "TransactionImportItem_reconciledTransactionId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["reconciledImportItemId"],
					name: "TransactionImportItem_reconciledImportItemId_fkey",
					onDelete: "restrict",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "TransactionImportItem" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "TransactionImportTransferSuggestionRejection_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "TransactionImportTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["outgoingFinancialAccountId"],
					name: "TransactionImportTransferRejection_outgoing_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionImportTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["incomingFinancialAccountId"],
					name: "TransactionImportTransferRejection_incoming_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "FinancialAccount" },
				},
				schema: "public",
				table: "TransactionImportTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "TransactionTransferSuggestionRejection_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["firstTransactionId"],
					name: "TransactionTransferSuggestionRejection_firstTransactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["secondTransactionId"],
					name: "TransactionTransferSuggestionRejection_secondTransactionId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "Transaction" },
				},
				schema: "public",
				table: "TransactionTransferSuggestionRejection",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "UserFinancialInstitution_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["institutionId"],
					name: "UserFinancialInstitution_institutionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitution" },
				},
				schema: "public",
				table: "UserFinancialInstitution",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["linkId"],
					name: "UserInstitutionProfileChange_linkId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "UserFinancialInstitution" },
				},
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["profileId"],
					name: "UserInstitutionProfileChange_profileId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "FinancialInstitutionProfile" },
				},
				schema: "public",
				table: "UserInstitutionProfileChange",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarCoverage_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarCoverage",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarCurrency_countryCode_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarCurrency",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarHoliday_countryCode_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarHoliday",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["countryCode"],
					name: "YieldCalendarOverride_countryCode_fkey",
					onDelete: "restrict",
					references: { columns: ["code"], schema: "public", table: "YieldCalendarCountry" },
				},
				schema: "public",
				table: "YieldCalendarOverride",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "account_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "account",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "session_userId_fkey",
					onDelete: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "session",
			}),
			this.addForeignKey({
				foreignKey: {
					columns: ["taxDefinitionId"],
					name: "taxDefinitionVersion_taxDefinitionId_fkey",
					onDelete: "restrict",
					references: { columns: ["id"], schema: "public", table: "taxDefinition" },
				},
				schema: "public",
				table: "taxDefinitionVersion",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
