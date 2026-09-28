import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { normalizeLegacyCreditPurchases } from "../../finance/src/legacy-credit-purchases";
import operations from "../migrations/app/20260928T1302_backfill_credit_purchases/ops.json";

const url = process.env.CREDIT_BACKFILL_TEST_URL;

// Schema through preserve_refund_history only. Every test rolls back its DDL and data.
describe.skipIf(!url)("normalized credit purchase SQL backfill", () => {
	let client: Client;
	const sourceTables = [
		"CreditPurchase",
		"CreditPurchaseHistory",
		"DebtPurchaseLink",
		"DebtEvent",
		"DebtSplit",
		"DebtSplitParticipant",
		"CreditCardImportItem",
		"TagAssignment",
		"CreditCardStatement",
		"Transaction",
	];
	const snapshot = async () => {
		const result: Record<string, unknown[]> = {};
		for (const table of sourceTables)
			result[table] = (await client.query(`SELECT * FROM "${table}" ORDER BY "id"`)).rows;
		return result;
	};
	const runSchema = async () => {
		for (const operation of operations.filter(op => op.id !== "creditPurchases.backfill"))
			for (const statement of operation.execute) await client.query(statement.sql);
	};
	const runData = async () => {
		const operation = operations.find(op => op.id === "creditPurchases.backfill")!;
		for (const statement of operation.execute) await client.query(statement.sql);
		for (const check of operation.postcheck)
			if ((await client.query(check.sql)).rows[0].result !== true) throw new Error(check.description);
	};
	beforeAll(async () => {
		const target = new URL(url!);
		if (
			!["localhost", "127.0.0.1"].includes(target.hostname) ||
			target.pathname !== "/zaimu_credit_backfill_test"
		)
			throw new Error("Teste exige banco descartável local zaimu_credit_backfill_test");
		client = new Client({ connectionString: url });
		await client.connect();
		if (
			(await client.query(`SELECT to_regclass('public."CreditPurchaseLegacyEntry"') AS table`)).rows[0]
				.table !== null
		)
			throw new Error("Teste exige schema anterior ao backfill");
	});
	afterAll(async () => {
		await client?.end();
	});
	beforeEach(async () => {
		await client.query("BEGIN");
		await client.query(`
		 INSERT INTO "user" ("id", "email", "name") VALUES ('u', 'credit-backfill@example.test', 'Teste');
		 INSERT INTO "FinancialAccount" ("id", "userId", "name", "type") VALUES ('a', 'u', 'Cartão', 'CREDIT_CARD'), ('rewards', 'u', 'Cashback', 'CHECKING');
		 INSERT INTO "CreditCard" ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay") VALUES ('card', 'a', 5000, 15, 25);
		 INSERT INTO "CreditCardStatement" ("id", "creditCardId", "statementDate", "dueDate", "totalAmount", "paidAmount", "isPaid") VALUES
		 ('aug', 'card', '2024-08-15', '2024-08-25', 9, 9, true), ('sep', 'card', '2024-09-15', '2024-09-25', 10.51, 0, false);
		 INSERT INTO "Category" ("id", "userId", "name") VALUES ('category', 'u', 'Categoria'), ('tag', 'u', 'Tag');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "storeName", "purchaseDate", "totalAmount", "installmentAmount", "installments", "currentInstallment", "categoryId", "externalId", "cashbackAccountId", "cashbackAmount", "cashbackYieldReferenceRate", "cashbackYieldReferencePercentage", "cashbackYieldPeriod", "feeAmount", "feeDescription")
		 VALUES ('purchase', 'u', 'aug', 'Compra', 'Loja', '2024-08-10', 30.01, 9, 3, 1, 'category', 'purchase-external', 'rewards', 0.3001, 12.5, 100, 'YEARLY', 0.25, 'IOF da compra');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "installments", "currentInstallment", "parentId", "hasImportedAmount", "externalId")
		 VALUES ('child', 'u', 'sep', 'Snapshot antigo', '2024-08-10', 30.01, 10.51, 3, 2, 'purchase', true, 'child-external');
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "isRefund", "refundOfPurchaseId") VALUES
		 ('refund', 'u', 'sep', 'Reembolso', '2024-09-10', -5, -5, true, 'child'), ('unlinked', 'u', 'sep', 'Crédito importado', '2024-09-10', -2, -2, true, NULL);
		 INSERT INTO "CreditPurchase" ("id", "userId", "statementId", "description", "purchaseDate", "totalAmount", "installmentAmount", "isStatementCharge", "isSettled")
		 VALUES ('charge', 'u', 'sep', 'Juros', '2024-09-10', 1.25, 1.25, true, true);
		 INSERT INTO "TagAssignment" ("id", "categoryId", "entityType", "entityId") VALUES
		 ('root-tag', 'tag', 'CREDIT_PURCHASE', 'purchase'), ('child-tag', 'tag', 'CREDIT_PURCHASE', 'child');
		 INSERT INTO "CreditPurchaseHistory" ("id", "creditPurchaseId", "field", "oldValue", "newValue") VALUES
		 ('history', 'child', 'installmentAmount', '10', '10.51');
		 INSERT INTO "DebtPerson" ("id", "userId", "name", "normalizedName") VALUES ('person', 'u', 'Pessoa', 'pessoa');
		 INSERT INTO "DebtEvent" ("id", "debtPersonId", "createdByUserId", "amount", "effect", "date") VALUES ('event', 'person', 'u', 4.5, 4.5, '2024-08-10');
		 INSERT INTO "DebtPurchaseLink" ("id", "eventId", "creditPurchaseId", "userId") VALUES ('link', 'event', 'child', 'u');
		 INSERT INTO "DebtSplit" ("id", "userId", "mode", "ownerIncluded", "ownerShares", "creditPurchaseId") VALUES ('split', 'u', 'SHARES', true, 1, 'purchase');
		 INSERT INTO "DebtSplitParticipant" ("id", "debtSplitId", "debtPersonId", "shares", "sortOrder") VALUES ('participant', 'split', 'person', 1, 0);
		 INSERT INTO "CreditCardImport" ("id", "userId", "creditCardId", "provider", "fileName", "statementDate", "dueDate") VALUES ('import', 'u', 'card', 'INTER', 'fatura.pdf', '2024-09-15', '2024-09-25');
		 INSERT INTO "CreditCardImportItem" ("id", "creditCardImportId", "externalId", "purchaseDate", "description", "totalAmount", "installmentAmount", "reconciledCreditPurchaseId") VALUES
		 ('import-item', 'import', 'bank-line', '2024-09-10', 'Compra', 30.01, 10.51, 'child');
		`);
	});
	afterEach(async () => {
		await client.query("ROLLBACK");
	});

	test("preserves cents, IDs, cashback snapshots, history, debts, tags, statements and import references", async () => {
		const before = await snapshot();
		await runSchema();
		await runData();
		expect(await snapshot()).toEqual(before);
		const rows = (
			await client.query(
				`SELECT "id", "purchaseId", "installmentId", "refundId", "chargeId", "requiresRefundReview" FROM "CreditPurchaseLegacyEntry" ORDER BY "id"`,
			)
		).rows;
		expect(rows).toEqual([
			{
				chargeId: "charge",
				id: "charge",
				installmentId: null,
				purchaseId: null,
				refundId: null,
				requiresRefundReview: false,
			},
			{
				chargeId: null,
				id: "child",
				installmentId: "child",
				purchaseId: "purchase",
				refundId: null,
				requiresRefundReview: false,
			},
			{
				chargeId: null,
				id: "purchase",
				installmentId: "purchase",
				purchaseId: "purchase",
				refundId: null,
				requiresRefundReview: false,
			},
			{
				chargeId: null,
				id: "refund",
				installmentId: null,
				purchaseId: "purchase",
				refundId: "refund",
				requiresRefundReview: false,
			},
			{
				chargeId: null,
				id: "unlinked",
				installmentId: null,
				purchaseId: null,
				refundId: null,
				requiresRefundReview: true,
			},
		]);
		const purchase = (await client.query(`SELECT * FROM "CreditPurchaseRecord"`)).rows[0];
		expect(purchase).toMatchObject({
			cashbackAccountId: "rewards",
			cashbackAmount: "0.3001",
			cashbackYieldPeriod: "YEARLY",
			cashbackYieldReferencePercentage: "100.0000",
			cashbackYieldReferenceRate: "12.5000",
			description: "Compra",
			externalId: "purchase-external",
			feeAmount: "0.25",
			id: "purchase",
			storeName: "Loja",
			totalAmount: "30.01",
		});
		expect(
			(await client.query(`SELECT "amount" FROM "CreditInstallmentPlan" ORDER BY "number"`)).rows.map(
				r => Number(r.amount),
			),
		).toEqual([9, 10.51, 10.5]);
		expect(
			(
				await client.query(
					`SELECT "id", "occurrenceDate"::text FROM "CreditInstallmentRecord" ORDER BY "number"`,
				)
			).rows,
		).toEqual([
			{ id: "purchase", occurrenceDate: "2024-08-10" },
			{ id: "child", occurrenceDate: "2024-09-10" },
		]);
		expect(
			(
				await client.query(
					`SELECT "amount", "policy", "cancellationEligible" FROM "CreditRefundRecord"`,
				)
			).rows,
		).toEqual([{ amount: "5.00", cancellationEligible: false, policy: "KEEP_INSTALLMENTS" }]);
		expect(
			(await client.query(`SELECT "amount", "isSettled" FROM "CreditStatementCharge"`)).rows,
		).toEqual([{ amount: "1.25", isSettled: true }]);
		const archived = (
			await client.query(`SELECT "original" FROM "CreditPurchaseLegacyEntry" WHERE "id" = 'child'`)
		).rows[0].original;
		expect(archived).toMatchObject({
			description: "Snapshot antigo",
			externalId: "child-external",
			tags: [expect.objectContaining({ id: "child-tag" })],
		});
	});

	test("SQL agrees with shared transformation and never materializes missing historical or future occurrences", async () => {
		await client.query(
			`UPDATE "CreditPurchase" SET "purchaseDate" = '2024-01-31' WHERE "id" IN ('purchase', 'child')`,
		);
		const legacy = (
			await client.query(
				`SELECT p.*, s."creditCardId", p."purchaseDate"::text AS "purchaseDate" FROM "CreditPurchase" p JOIN "CreditCardStatement" s ON s."id" = p."statementId"`,
			)
		).rows;
		const expected = normalizeLegacyCreditPurchases(
			legacy.map(row => ({
				...row,
				installmentAmount: Number(row.installmentAmount),
				tagIds: [],
				totalAmount: Number(row.totalAmount),
			})),
			[
				{ id: "aug", statementDate: "2024-08-15" },
				{ id: "sep", statementDate: "2024-09-15" },
			],
		);
		await runSchema();
		await runData();
		expect(
			(await client.query(`SELECT "amount" FROM "CreditInstallmentPlan" ORDER BY "number"`)).rows.map(
				row => Math.round(Number(row.amount) * 100),
			),
		).toEqual(expected.purchases[0]!.installmentAmountsCents);
		expect(
			(
				await client.query(
					`SELECT "occurrenceDate"::text FROM "CreditInstallmentRecord" ORDER BY "number"`,
				)
			).rows.map(row => row.occurrenceDate),
		).toEqual(["2024-01-31", "2024-02-29"]);
		expect((await client.query(`SELECT count(*) FROM "CreditInstallmentRecord"`)).rows[0].count).toBe(
			"2",
		);
	});

	for (const [label, mutation, reason] of [
		[
			"duplicate installments",
			`UPDATE "CreditPurchase" SET "currentInstallment" = 1 WHERE "id" = 'child'`,
			"duplicate legacy installment",
		],
		[
			"over-refunded purchase",
			`UPDATE "CreditPurchase" SET "totalAmount" = -31, "installmentAmount" = -31 WHERE "id" = 'refund'`,
			"refunds exceed",
		],
		[
			"insufficient total",
			`UPDATE "CreditPurchase" SET "totalAmount" = 19.50 WHERE "id" = 'purchase'`,
			"does not fit",
		],
		[
			"invalid parent",
			`UPDATE "CreditPurchase" SET "parentId" = 'refund' WHERE "id" = 'child'`,
			"Invalid legacy purchase",
		],
	] as const) {
		test(`rejects ${label} and rolls back all normalized writes`, async () => {
			await client.query(mutation);
			const before = await snapshot();
			await runSchema();
			await client.query("SAVEPOINT backfill");
			await expect(runData()).rejects.toThrow(reason);
			await client.query("ROLLBACK TO SAVEPOINT backfill");
			expect(await snapshot()).toEqual(before);
			for (const table of [
				"CreditPurchaseRecord",
				"CreditInstallmentRecord",
				"CreditRefundRecord",
				"CreditStatementCharge",
				"CreditPurchaseLegacyEntry",
			])
				expect((await client.query(`SELECT count(*) FROM "${table}"`)).rows[0].count).toBe("0");
		});
	}

	test("late database failure rolls back copied purchases and leaves original records intact", async () => {
		const before = await snapshot();
		await runSchema();
		await client.query(`CREATE FUNCTION fail_credit_backfill() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected mapping failure'; END $$;
		 CREATE TRIGGER fail_credit_backfill BEFORE INSERT ON "CreditPurchaseLegacyEntry" FOR EACH ROW EXECUTE FUNCTION fail_credit_backfill()`);
		await client.query("SAVEPOINT backfill");
		await expect(runData()).rejects.toThrow("injected mapping failure");
		await client.query("ROLLBACK TO SAVEPOINT backfill");
		expect(await snapshot()).toEqual(before);
		expect((await client.query(`SELECT count(*) FROM "CreditPurchaseRecord"`)).rows[0].count).toBe("0");
	});
});
