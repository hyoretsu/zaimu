#!/usr/bin/env -S node
import { col, Migration, MigrationCLI, rawSql } from "@prisma/orm-postgres/migration";
import type { Contract as Start } from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract";
import startContract from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract.json" with {
	type: "json",
};
import type { Contract as End } from "../../snapshots/8930d7ebc0768255b12e607af54c09375cd5889e9fdc732125d257596fb6ac31/contract";
import endContract from "../../snapshots/8930d7ebc0768255b12e607af54c09375cd5889e9fdc732125d257596fb6ac31/contract.json" with {
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
			rawSql(`UPDATE "Transaction" payment SET "paymentCreditCardId" = statement."creditCardId"
        FROM "CreditCardStatement" statement WHERE payment."creditCardStatementId" = statement."id"`),
			rawSql(`UPDATE "TransactionImportItem" payment SET "paymentCreditCardId" = statement."creditCardId"
        FROM "CreditCardStatement" statement WHERE payment."creditCardStatementId" = statement."id"`),
			rawSql(`WITH cycles AS (
        SELECT DISTINCT payment."paymentCreditCardId" AS "creditCardId", card."dueDay", card."statementDay",
          (date_trunc('month', payment."date" + CASE WHEN EXTRACT(day FROM payment."date") > card."statementDay"
            THEN interval '1 month' ELSE interval '0 month' END)
            + (card."statementDay" - 1) * interval '1 day')::date AS "statementDate"
        FROM "Transaction" payment
        JOIN "CreditCard" card ON card."id" = payment."paymentCreditCardId"
        WHERE payment."paymentCreditCardId" IS NOT NULL
      )
      INSERT INTO "CreditCardStatement" ("creditCardId", "statementDate", "dueDate", "totalAmount")
      SELECT "creditCardId", "statementDate",
        (date_trunc('month', "statementDate") + ("dueDay" - 1) * interval '1 day'
          + CASE WHEN "dueDay" <= "statementDay" THEN interval '1 month' ELSE interval '0 month' END)::date,
        0
      FROM cycles ON CONFLICT ("creditCardId", "statementDate") DO NOTHING`),
			rawSql(`WITH payments AS (
        SELECT "paymentCreditCardId" AS "creditCardId", SUM("amount") AS credit
        FROM "Transaction" WHERE "paymentCreditCardId" IS NOT NULL
        GROUP BY "paymentCreditCardId"
      ), ordered AS (
        SELECT statement."id", statement."creditCardId", statement."totalAmount" AS total,
          COALESCE(payments.credit, 0) AS credit,
          COALESCE(SUM(statement."totalAmount") OVER (
            PARTITION BY statement."creditCardId" ORDER BY statement."statementDate", statement."id"
            ROWS BETWEEN UNBOUNDED PRECEDING AND 1 PRECEDING
          ), 0) AS previous_total,
          SUM(statement."totalAmount") OVER (PARTITION BY statement."creditCardId") AS card_total,
          ROW_NUMBER() OVER (
            PARTITION BY statement."creditCardId" ORDER BY statement."statementDate" DESC, statement."id" DESC
          ) = 1 AS last_statement
        FROM "CreditCardStatement" statement
        LEFT JOIN payments ON payments."creditCardId" = statement."creditCardId"
      ), allocated AS (
        SELECT "id", total,
          LEAST(GREATEST(total, 0), GREATEST(credit - previous_total, 0))
            + CASE WHEN last_statement THEN GREATEST(credit - card_total, 0) ELSE 0 END
            + LEAST(total, 0) AS paid
        FROM ordered
      )
      UPDATE "CreditCardStatement" statement
      SET "paidAmount" = allocated.paid,
        "isPaid" = allocated.paid >= allocated.total
          AND (allocated.total <> 0 OR allocated.paid <> 0)
      FROM allocated WHERE statement."id" = allocated."id"`),

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
