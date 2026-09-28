#!/usr/bin/env -S node
import { col, lit, Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/02ae9281e9c70a5344267de7e6d46a07785edab869cb8fd21559609cba5adc68/contract";
import endContract from "../../snapshots/02ae9281e9c70a5344267de7e6d46a07785edab869cb8fd21559609cba5adc68/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract";
import startContract from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.addColumn({
				column: col("paymentCreditCardId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "Transaction",
			}),
			this.addColumn({
				column: col("paymentCreditCardId", "character varying(36)", {
					codecRef: { codecId: "sql/varchar@1", typeParams: { length: 36 } },
				}),
				schema: "public",
				table: "TransactionImportItem",
			}),
			...(["CreditPurchase", "CreditCardImportItem"] as const).map(table =>
				this.addColumn({
					column: col("isStatementCharge", "bool", {
						codecRef: { codecId: "pg/bool@1" },
						default: lit(false),
						notNull: true,
					}),
					schema: "public",
					table,
				}),
			),
			this.addColumn({
				column: col("reportedPreviousBalance", "numeric(12,2)", {
					codecRef: { codecId: "pg/numeric@1", typeParams: { precision: 12, scale: 2 } },
				}),
				schema: "public",
				table: "CreditCardImport",
			}),
			rawSql({
				execute: [
					{
						description: "Backfill card IDs, preserving every existing payment field",
						sql: `
     UPDATE "Transaction" payment SET "paymentCreditCardId" = statement."creditCardId"
      FROM "CreditCardStatement" statement WHERE payment."creditCardStatementId" = statement."id";
     UPDATE "TransactionImportItem" payment SET "paymentCreditCardId" = statement."creditCardId"
      FROM "CreditCardStatement" statement WHERE payment."creditCardStatementId" = statement."id";
     UPDATE "CreditPurchase" SET "isStatementCharge" = true,
       "cashbackAccountId" = NULL, "cashbackAmount" = NULL
      WHERE btrim("description") ~* '^(juros|multa|mora|encargos|iof)([[:space:][:punct:]]|$)';
     UPDATE "CreditCardImportItem" SET "isStatementCharge" = true
      WHERE btrim("description") ~* '^(juros|multa|mora|encargos|iof)([[:space:][:punct:]]|$)';
    `,
					},
				],
				id: "cardPayments.backfill",
				label: "Preserve legacy card payments before dropping statement links",
				operationClass: "data",
				postcheck: [
					{
						description: "Every old statement link resolves to the same card",
						sql: `SELECT
     NOT EXISTS (SELECT 1 FROM "Transaction" p LEFT JOIN "CreditCardStatement" s ON s."id" = p."creditCardStatementId"
      WHERE p."creditCardStatementId" IS NOT NULL AND (s."id" IS NULL OR p."paymentCreditCardId" IS DISTINCT FROM s."creditCardId"))
     AND NOT EXISTS (SELECT 1 FROM "TransactionImportItem" p LEFT JOIN "CreditCardStatement" s ON s."id" = p."creditCardStatementId"
      WHERE p."creditCardStatementId" IS NOT NULL AND (s."id" IS NULL OR p."paymentCreditCardId" IS DISTINCT FROM s."creditCardId")) AS result`,
					},
				],
				precheck: [],
				target: { id: "postgres" },
			}),
			rawSql({
				execute: [
					{
						description: "Fill monthly gaps while preserving existing statement dates",
						sql: `
     WITH events AS (
      SELECT c."id", c."statementDay", c."dueDay", p."date" AS date
       FROM "CreditCard" c JOIN "Transaction" p ON p."paymentCreditCardId" = c."id"
      UNION ALL
      SELECT c."id", c."statementDay", c."dueDay", CURRENT_DATE FROM "CreditCard" c
       WHERE EXISTS (SELECT 1 FROM "CreditCardStatement" s WHERE s."creditCardId" = c."id")
        OR EXISTS (SELECT 1 FROM "Transaction" p WHERE p."paymentCreditCardId" = c."id")
     ), event_months AS (
      SELECT "id", "statementDay", "dueDay", date_trunc('month', date)
       + CASE WHEN EXTRACT(day FROM date) > "dueDay" THEN INTERVAL '1 month' ELSE INTERVAL '0 month' END
       - CASE WHEN "dueDay" <= "statementDay" THEN INTERVAL '1 month' ELSE INTERVAL '0 month' END AS month
      FROM events
      UNION ALL
      SELECT c."id", c."statementDay", c."dueDay", date_trunc('month', s."statementDate")
       FROM "CreditCard" c JOIN "CreditCardStatement" s ON s."creditCardId" = c."id"
     ), starts AS (
      SELECT "id", "statementDay", "dueDay", MIN(month) AS first_date, MAX(month) AS last_date
      FROM event_months GROUP BY "id", "statementDay", "dueDay"
     ), dates AS (
      SELECT starts.*, month,
       (month + (LEAST("statementDay", EXTRACT(day FROM month + INTERVAL '1 month - 1 day')) - 1) * INTERVAL '1 day')::date AS closing,
       month + CASE WHEN "dueDay" <= "statementDay" THEN INTERVAL '1 month' ELSE INTERVAL '0 month' END AS due_month
      FROM starts CROSS JOIN LATERAL generate_series(date_trunc('month', first_date), date_trunc('month', last_date), INTERVAL '1 month') month
     )
     INSERT INTO "CreditCardStatement" ("creditCardId", "statementDate", "dueDate", "totalAmount")
      SELECT "id", closing,
       (due_month + (LEAST("dueDay", EXTRACT(day FROM due_month + INTERVAL '1 month - 1 day')) - 1) * INTERVAL '1 day')::date, 0
      FROM dates WHERE NOT EXISTS (SELECT 1 FROM "CreditCardStatement" s WHERE s."creditCardId" = dates."id"
       AND date_trunc('month', s."statementDate") = month)
      ON CONFLICT ("creditCardId", "statementDate") DO NOTHING;
    `,
					},
					{
						description: "Replay dated payments without retroactively paying overdue invoices",
						sql: `
     WITH RECURSIVE ordered AS (
      SELECT s.*, ROW_NUMBER() OVER (PARTITION BY s."creditCardId" ORDER BY s."dueDate", s."id") AS rn,
       (SELECT COALESCE(SUM(p."amount"), 0) FROM "Transaction" p WHERE p."paymentCreditCardId" = s."creditCardId"
        AND p."date" <= CURRENT_DATE AND s."id" = (SELECT target."id" FROM "CreditCardStatement" target
         WHERE target."creditCardId" = s."creditCardId" AND target."dueDate" >= p."date" ORDER BY target."dueDate", target."id" LIMIT 1)) AS payment
      FROM "CreditCardStatement" s
     ), replay AS (
      SELECT s."id", s."creditCardId", s.rn, s."dueDate", s."totalAmount"::numeric AS amount_due, s.payment,
       (s."totalAmount" - s.payment)::numeric AS remaining, 0::numeric AS incoming
      FROM ordered s WHERE s.rn = 1
      UNION ALL
      SELECT s."id", s."creditCardId", s.rn, s."dueDate",
       s."totalAmount" + GREATEST(carry.amount, 0), s.payment,
       (s."totalAmount" + carry.amount - s.payment)::numeric, carry.amount
      FROM replay previous JOIN ordered s ON s."creditCardId" = previous."creditCardId" AND s.rn = previous.rn + 1
      CROSS JOIN LATERAL (SELECT CASE WHEN previous.remaining < 0 OR previous."dueDate" < CURRENT_DATE
       THEN previous.remaining ELSE 0 END AS amount) carry
     )
     UPDATE "CreditCardStatement" s SET
      "paidAmount" = GREATEST(0, LEAST(GREATEST(replay.amount_due, 0), replay.payment + GREATEST(-replay.incoming, 0))),
      "isPaid" = replay.remaining <= 0 AND (replay.amount_due <> 0 OR replay.payment > 0 OR replay.incoming < 0)
     FROM replay WHERE replay."id" = s."id";
    `,
					},
				],
				id: "cardPayments.cycles",
				label: "Create historical due-date cycles and replay payments chronologically",
				operationClass: "data",
				postcheck: [],
				precheck: [],
				target: { id: "postgres" },
			}),

			this.dropConstraint({
				constraint: "Transaction_creditCardStatementId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "Transaction",
			}),
			this.dropIndex({
				index: "Transaction_creditCardStatementId_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.dropColumn({ column: "creditCardStatementId", schema: "public", table: "Transaction" }),
			this.dropConstraint({
				constraint: "TransactionImportItem_creditCardStatementId_fkey",
				kind: "foreignKey",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.dropIndex({
				index: "TransactionImportItem_creditCardStatementId_idx",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.dropColumn({
				column: "creditCardStatementId",
				schema: "public",
				table: "TransactionImportItem",
			}),
			this.createIndex({
				columns: ["paymentCreditCardId"],
				index: "Transaction_paymentCreditCardId_idx",
				schema: "public",
				table: "Transaction",
			}),
			this.createIndex({
				columns: ["paymentCreditCardId"],
				index: "TransactionImportItem_paymentCreditCardId_idx",
				schema: "public",
				table: "TransactionImportItem",
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
					columns: ["paymentCreditCardId"],
					name: "TransactionImportItem_paymentCreditCardId_fkey",
					onDelete: "setNull",
					onUpdate: "cascade",
					references: { columns: ["id"], schema: "public", table: "CreditCard" },
				},
				schema: "public",
				table: "TransactionImportItem",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
