#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract";
import startContract from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract";
import endContract from "../../snapshots/e379a355157863698b48b65b34def1bf8d9b6632a53293c97d424f1c29455bd8/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
						notNull: true,
					}),
					col("kind", "character varying(20)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
						notNull: true,
					}),
					col("series", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
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
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("createdAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("deduplicationKey", "character varying(200)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 200 } },
						notNull: true,
					}),
					col("endDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("generation", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("id", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						default: fn("cuid2()"),
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
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("nextAttemptAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
					}),
					col("series", "character varying(10)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 10 } },
						notNull: true,
					}),
					col("startDate", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("state", "character varying(32)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 32 } },
						default: lit("PENDING"),
						notNull: true,
					}),
					col("updatedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["id"])],
				schema: "public",
				table: "FinancialHistoryUnit",
			}),
			this.createTable({
				columns: [
					col("leaseToken", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
					}),
					col("lockedUntil", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
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
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.addColumn({
				column: col("leaseToken", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "ConsumerReceipt",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImport",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.addColumn({
				column: col("bookingCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "DebtEvent",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "DebtSplit",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitution",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "FinancialInstitutionYieldPolicy",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Loan",
			}),
			this.addColumn({
				column: col("accountAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("accountCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "LoanPayment",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Recurrence",
			}),
			this.addColumn({
				column: col("conversionCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "RewardsAccount",
			}),
			this.addColumn({
				column: col("bookingCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("conversionSource", "character varying(20)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 20 } },
					default: lit("DAILY"),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("destinationAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("destinationCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("paymentAmount", "numeric(20,6)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 20, scale: 6 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("paymentCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "TransactionImport",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.addColumn({
				column: col("preferredCurrency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
				}),
				schema: "public",
				table: "user",
			}),
			this.alterColumnType({
				column: "balance",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "BalanceAdjustment",
			}),
			this.alterColumnType({
				column: "creditLimit",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCard",
			}),
			this.alterColumnType({
				column: "securityDeposit",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCard",
			}),
			this.alterColumnType({
				column: "reportedPreviousBalance",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCardImport",
			}),
			this.alterColumnType({
				column: "installmentAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.alterColumnType({
				column: "totalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCardImportItem",
			}),
			this.alterColumnType({
				column: "paidAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.alterColumnType({
				column: "totalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditCardStatement",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditInstallmentPlan",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditInstallmentRecord",
			}),
			this.alterColumnType({
				column: "feeAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.alterColumnType({
				column: "originalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.alterColumnType({
				column: "refinancingFeeAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.alterColumnType({
				column: "totalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditRefundRecord",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "CreditStatementCharge",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "DebtEvent",
			}),
			this.alterColumnType({
				column: "effect",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "DebtEvent",
			}),
			this.alterColumnType({
				column: "fixedAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "DebtSplitParticipant",
			}),
			this.alterColumnType({
				column: "balance",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "FinancialAccount",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,8)",
					qualifiedTargetType: "numeric(20,8)",
					rawTargetTypeForLabel: "numeric(20,8)",
				},
				schema: "public",
				table: "FinancialAccountYield",
			}),
			this.alterColumnType({
				column: "upToBalance",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "FinancialInstitutionYieldRule",
			}),
			this.alterColumnType({
				column: "installmentAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "Loan",
			}),
			this.alterColumnType({
				column: "principalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "Loan",
			}),
			this.alterColumnType({
				column: "interestPaid",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "LoanPayment",
			}),
			this.alterColumnType({
				column: "principalPaid",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "LoanPayment",
			}),
			this.alterColumnType({
				column: "totalPaid",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "LoanPayment",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "Recurrence",
			}),
			this.alterColumnType({
				column: "conversionAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "RewardsAccount",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "Transaction",
			}),
			this.alterColumnType({
				column: "originalAmount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "Transaction",
			}),
			this.alterColumnType({
				column: "amount",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.alterColumnType({
				column: "balanceAfter",
				options: {
					formatTypeExpected: "numeric(20,6)",
					qualifiedTargetType: "numeric(20,6)",
					rawTargetTypeForLabel: "numeric(20,6)",
				},
				schema: "public",
				table: "TransactionImportItem",
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
			rawSql({
				execute: [
					{
						description:
							"Backfill native money without reinterpreting original foreign principal",
						sql: `
UPDATE "CreditPurchaseRecord" p SET "bookingCurrency"=c."currency" FROM "CreditCard" c WHERE c."id"=p."creditCardId";
UPDATE "CreditCardStatement" s SET "currency"=c."currency" FROM "CreditCard" c WHERE c."id"=s."creditCardId";
UPDATE "Transaction" t SET "bookingCurrency"=a."currency" FROM "FinancialAccount" a WHERE a."id"=COALESCE(t."originFinancialAccountId",t."destinationFinancialAccountId");
UPDATE "Transaction" t SET "destinationAmount"=t."amount", "destinationCurrency"=a."currency" FROM "FinancialAccount" a WHERE t."type"='TRANSFER' AND a."id"=t."destinationFinancialAccountId";
UPDATE "Transaction" t SET "paymentAmount"=t."amount", "paymentCurrency"=c."currency" FROM "CreditCard" c WHERE c."id"=t."paymentCreditCardId";
INSERT INTO "FinancialHistoryUnit" ("id","deduplicationKey","kind","series","startDate","endDate","state","completedAt")
SELECT cuid2(), 'INTEREST:' || series || ':' || start_date || ':' || end_date, 'INTEREST', series, start_date::date, end_date::date, 'COMPLETED', now()
FROM (SELECT DISTINCT "payload"->>'referenceType' AS series, "payload"->>'startDate' AS start_date, "payload"->>'endDate' AS end_date FROM "OutboxEvent" WHERE "eventType"='referenceRate.historyFetched') coverage
WHERE series IN ('CDI','SELIC') AND start_date IS NOT NULL AND end_date IS NOT NULL
ON CONFLICT ("deduplicationKey") DO NOTHING;`,
					},
				],
				id: "internationalMoney.legacyDenominationsAndCoverage",
				label: "Preserve native currencies and import proven interest coverage",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
