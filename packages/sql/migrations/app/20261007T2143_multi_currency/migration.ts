#!/usr/bin/env -S node
import { col, fn, lit, Migration, MigrationCLI, primaryKey } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/029c93a1fcdeb2607c647a09a43c3ee809ce86d785f50a71c707228e057ae380/contract";
import startContract from "../../snapshots/029c93a1fcdeb2607c647a09a43c3ee809ce86d785f50a71c707228e057ae380/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract";
import endContract from "../../snapshots/6348b1486ea4d1e990ccdfc26aa30c3af4c7c4b6641129b0a3b66a9e5adae3a3/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("baseCurrency", "character varying(3)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
						notNull: true,
					}),
					col("date", "date", { codecRef: { codecId: "pg/date@1" }, notNull: true }),
					col("fetchedAt", "timestamptz(3)", {
						codecRef: { codecId: "pg/timestamptz@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("rates", "json", { codecRef: { codecId: "pg/json@1" }, notNull: true }),
				],
				constraints: [primaryKey(["date", "baseCurrency"], { name: "CurrencyRateSnapshot_pkey" })],
				schema: "public",
				table: "CurrencyRateSnapshot",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditCard",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("exchangeRate", "numeric(24,12)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 24, scale: 12 } },
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("fees", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "CreditPurchaseRecord",
			}),
			this.addColumn({
				column: col("originalAmount", "numeric(12,2)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
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
				table: "FinancialAccount",
			}),
			this.addColumn({
				column: col("currency", "character varying(3)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 3 } },
					default: lit("BRL"),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("exchangeRate", "numeric(24,12)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 24, scale: 12 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("fees", "json", {
					codecRef: { codecId: "pg/json@1" },
					default: lit([]),
					notNull: true,
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("originalAmount", "numeric(12,2)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
