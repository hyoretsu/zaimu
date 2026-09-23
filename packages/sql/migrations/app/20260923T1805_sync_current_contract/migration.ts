#!/usr/bin/env -S node
import {
	checkExpression,
	col,
	fn,
	lit,
	Migration,
	MigrationCLI,
	primaryKey,
	rawSql,
} from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/4da73ccb3f5e31202eee1e2b6f409a8759a1998f2128de4ae30894bccb2ce11b/contract";
import endContract from "../../snapshots/4da73ccb3f5e31202eee1e2b6f409a8759a1998f2128de4ae30894bccb2ce11b/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/71ad72b2a31c3f1bb4d0b4bd77b04797020b43fb4d86959a92c45d4dc6b6e4c5/contract";
import startContract from "../../snapshots/71ad72b2a31c3f1bb4d0b4bd77b04797020b43fb4d86959a92c45d4dc6b6e4c5/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.createTable({
				columns: [
					col("attempts", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(0),
						notNull: true,
					}),
					col("completedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("consumer", "character varying(120)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 120 } },
						notNull: true,
					}),
					col("createdAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
					col("eventId", "character varying(36)", {
						codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
						notNull: true,
					}),
					col("lastError", "text", { codecRef: { codecId: "pg/text@1" } }),
					col("lockedUntil", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
						notNull: true,
					}),
				],
				constraints: [primaryKey(["consumer", "eventId"], { name: "ConsumerReceipt_pkey" })],
				schema: "public",
				table: "ConsumerReceipt",
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
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
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
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("occurredAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						notNull: true,
					}),
					col("payload", "json", {
						codecRef: { codecId: "pg/json@1" },
						default: lit("{}"),
						notNull: true,
					}),
					col("publishedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
					}),
					col("schemaVersion", "int4", {
						codecRef: { codecId: "pg/int4@1" },
						default: lit(1),
						notNull: true,
					}),
					col("updatedAt", "timestamp(3)", {
						codecRef: { codecId: "pg/timestamp@1", typeParams: { precision: 3 } },
						default: fn("now()"),
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
						'array_position("userIds", NULL) IS NULL',
					),
				],
				schema: "public",
				table: "OutboxEvent",
			}),
			this.addColumn({
				column: col("userId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "CreditPurchase",
			}),
			rawSql({
				execute: [
					{
						description: "Derive owner from statement card account",
						sql: `UPDATE "public"."CreditPurchase" purchase
SET "userId" = account."userId"
FROM "public"."CreditCardStatement" statement
JOIN "public"."CreditCard" card ON card."id" = statement."creditCardId"
JOIN "public"."FinancialAccount" account ON account."id" = card."financialAccountId"
WHERE statement."id" = purchase."statementId";
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "public"."CreditPurchase" WHERE "userId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill CreditPurchase.userId';
  END IF;
END $$;`,
					},
				],
				id: "backfill-CreditPurchase-userId",
				label: "Backfill credit purchase owners",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.setNotNull({ column: "userId", schema: "public", table: "CreditPurchase" }),
			this.addColumn({
				column: col("userId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			rawSql({
				execute: [
					{
						description: "Derive owner from linked financial records",
						sql: `UPDATE "public"."Transaction" transaction
SET "userId" = COALESCE(
  (SELECT account."userId" FROM "public"."FinancialAccount" account WHERE account."id" = transaction."originFinancialAccountId"),
  (SELECT account."userId" FROM "public"."FinancialAccount" account WHERE account."id" = transaction."destinationFinancialAccountId"),
  (SELECT account."userId" FROM "public"."CreditCardStatement" statement
    JOIN "public"."CreditCard" card ON card."id" = statement."creditCardId"
    JOIN "public"."FinancialAccount" account ON account."id" = card."financialAccountId"
    WHERE statement."id" = transaction."creditCardStatementId"),
  (SELECT recurring."userId" FROM "public"."RecurringPayment" recurring WHERE recurring."id" = transaction."recurrenceId"),
  (SELECT salary."userId" FROM "public"."Salary" salary WHERE salary."id" = transaction."salaryId"),
  (SELECT subscription."userId" FROM "public"."Subscription" subscription WHERE subscription."id" = transaction."subscriptionId")
);
DO $$ BEGIN
  IF EXISTS (SELECT 1 FROM "public"."Transaction" WHERE "userId" IS NULL) THEN
    RAISE EXCEPTION 'Cannot backfill Transaction.userId';
  END IF;
END $$;`,
					},
				],
				id: "backfill-Transaction-userId",
				label: "Backfill transaction owners",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
			this.setNotNull({ column: "userId", schema: "public", table: "Transaction" }),
			this.createIndex({
				columns: ["completedAt", "createdAt"],
				index: "ConsumerReceipt_cleanup_idx",
				schema: "public",
				table: "ConsumerReceipt",
			}),
			this.createIndex({
				columns: ["statementId", "purchaseDate", "id"],
				index: "CreditPurchase_statementId_purchaseDate_id_idx",
				schema: "public",
				table: "CreditPurchase",
			}),
			this.createIndex({
				columns: ["userId", "purchaseDate", "createdAt", "id"],
				index: "CreditPurchase_userId_purchaseDate_createdAt_id_idx",
				schema: "public",
				table: "CreditPurchase",
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
			this.addForeignKey({
				foreignKey: {
					columns: ["userId"],
					name: "CreditPurchase_userId_fkey",
					onDelete: "cascade",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "user" },
				},
				schema: "public",
				table: "CreditPurchase",
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
			rawSql({
				execute: [
					{
						description: "Install search extensions, function, and indexes",
						sql: `CREATE EXTENSION IF NOT EXISTS pg_trgm;
CREATE EXTENSION IF NOT EXISTS unaccent;
CREATE OR REPLACE FUNCTION public.normalize_search(value TEXT)
RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE
RETURN lower(public.unaccent('public.unaccent', coalesce(value, '')));
CREATE INDEX "Transaction_description_search_idx" ON "public"."Transaction" USING GIN (public.normalize_search("description") gin_trgm_ops);
CREATE INDEX "Transaction_storeName_search_idx" ON "public"."Transaction" USING GIN (public.normalize_search("storeName") gin_trgm_ops);
CREATE INDEX "CreditPurchase_description_search_idx" ON "public"."CreditPurchase" USING GIN (public.normalize_search("description") gin_trgm_ops);
CREATE INDEX "CreditPurchase_storeName_search_idx" ON "public"."CreditPurchase" USING GIN (public.normalize_search("storeName") gin_trgm_ops);`,
					},
				],
				id: "transaction-search-indexes",
				label: "Create normalized transaction search indexes",
				operationClass: "additive",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
