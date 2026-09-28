import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";

const testUrl = process.env.NORMALIZED_PURCHASE_TEST_URL;

/** Requires the migrated schema in a fresh, explicitly named local disposable database. */
describe.skipIf(!testUrl)("normalized refund transactions", () => {
	let client: Client;
	let refunds: typeof import("../application/normalized-refunds");
	const context = {
		cardId: "normalized-test-card",
		purchaseId: "normalized-test-purchase",
		userId: "normalized-test-user",
	};
	const secondContext = { ...context, purchaseId: "normalized-test-second" };
	beforeAll(async () => {
		const url = new URL(testUrl!);
		if (!["localhost", "127.0.0.1"].includes(url.hostname) || url.pathname !== "/zaimu_credit_test")
			throw new Error("Teste exige banco descartável local zaimu_credit_test");
		process.env.DATABASE_URL = testUrl;
		refunds = await import("../application/normalized-refunds");
		client = new Client({ connectionString: testUrl });
		await client.connect();
		await client.query(`
		 INSERT INTO "user" ("id", "email", "name") VALUES ('normalized-test-user', 'normalized@example.test', 'Teste');
		 INSERT INTO "FinancialInstitution" ("id", "userId", "name", "normalizedName")
		 VALUES ('normalized-test-bank', 'normalized-test-user', 'Banco', 'banco');
		 INSERT INTO "FinancialAccount" ("id", "userId", "name", "type", "institutionId")
		 VALUES ('normalized-test-account', 'normalized-test-user', 'Cartão', 'CREDIT_CARD', 'normalized-test-bank');
		 INSERT INTO "CreditCard" ("id", "financialAccountId", "creditLimit", "statementDay", "dueDay")
		 VALUES ('normalized-test-card', 'normalized-test-account', 5000, 31, 5);
		 INSERT INTO "CreditPurchaseRecord" ("id", "userId", "creditCardId", "description", "purchaseDate", "totalAmount")
		 VALUES ('normalized-test-purchase', 'normalized-test-user', 'normalized-test-card', 'Compra', '2024-08-10', 300),
		 ('normalized-test-second', 'normalized-test-user', 'normalized-test-card', 'Outra compra', '2024-08-10', 100);
		 INSERT INTO "CreditInstallmentPlan" ("purchaseId", "number", "amount")
		 VALUES ('normalized-test-purchase', 1, 100), ('normalized-test-purchase', 2, 100), ('normalized-test-purchase', 3, 100),
		 ('normalized-test-second', 1, 100);
		`);
	});

	afterAll(async () => {
		await client?.query(`DELETE FROM "user" WHERE "id" = 'normalized-test-user'`);
		await client?.end();
		const sql = await import("~/shared/infra/sql");
		await sql.closeDatabase();
	});

	test("full refund posts difference and locks institution policy; edit keeps ID", async () => {
		const refund = await refunds.createNormalizedRefund(context, {
			creditDate: "2024-08-20",
			policy: "CANCEL_FUTURE_INSTALLMENTS",
		});
		expect(refund.amountCents).toBe(30000);
		expect(refund.cancellationEligible).toBe(true);
		// First purchase cancels future R$ 200 and posts R$ 100 credit. Other purchase remains R$ 100.
		expect(
			Number(
				(
					await client.query(`SELECT "totalAmount" FROM "CreditCardStatement" WHERE "id" = $1`, [
						refund.creditStatementId,
					])
				).rows[0].totalAmount,
			),
		).toBe(100);
		expect(
			(
				await client.query(
					`SELECT "creditRefundPolicy" FROM "FinancialInstitution" WHERE "id" = 'normalized-test-bank'`,
				)
			).rows[0].creditRefundPolicy,
		).toBe("CANCEL_FUTURE_INSTALLMENTS");
		const edited = await refunds.editNormalizedRefund(context, refund.id, {
			amount: 100,
			creditDate: "2024-09-20",
		});
		expect(edited.id).toBe(refund.id);
		expect(edited.amountCents).toBe(10000);
		expect(edited.cancellationEligible).toBe(false);
		const rows = await client.query(`SELECT "id" FROM "CreditRefundRecord" WHERE "purchaseId" = $1`, [
			context.purchaseId,
		]);
		expect(rows.rows).toEqual([{ id: refund.id }]);
		await refunds.deleteNormalizedRefund(context, refund.id);
		expect(
			(await client.query(`SELECT "deletedAt" FROM "CreditRefundRecord" WHERE "id" = $1`, [refund.id]))
				.rows[0].deletedAt,
		).not.toBeNull();
	});

	test("concurrent partial refunds cannot exceed purchase total", async () => {
		const results = await Promise.allSettled([
			refunds.createNormalizedRefund(secondContext, { amount: 70, creditDate: "2024-08-20" }),
			refunds.createNormalizedRefund(secondContext, { amount: 70, creditDate: "2024-08-20" }),
		]);
		expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect(results.filter(result => result.status === "rejected")).toHaveLength(1);
		expect(
			Number(
				(
					await client.query(
						`SELECT sum("amount") FROM "CreditRefundRecord" WHERE "purchaseId" = $1 AND "deletedAt" IS NULL`,
						[secondContext.purchaseId],
					)
				).rows[0].sum,
			),
		).toBe(70);
	});

	test("failure during replay rolls back refund and institutional state", async () => {
		await client.query(
			`UPDATE "CreditInstallmentPlan" SET "amount" = 99 WHERE "purchaseId" = $1 AND "number" = 1`,
			[secondContext.purchaseId],
		);
		await expect(
			refunds.createNormalizedRefund(secondContext, { amount: 10, creditDate: "2024-08-20" }),
		).rejects.toThrow();
		expect(
			Number(
				(
					await client.query(`SELECT count(*) FROM "CreditRefundRecord" WHERE "purchaseId" = $1`, [
						secondContext.purchaseId,
					])
				).rows[0].count,
			),
		).toBe(1);
		await client.query(
			`UPDATE "CreditInstallmentPlan" SET "amount" = 100 WHERE "purchaseId" = $1 AND "number" = 1`,
			[secondContext.purchaseId],
		);
	});
});
