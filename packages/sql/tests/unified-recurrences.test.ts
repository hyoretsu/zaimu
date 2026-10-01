import { describe, expect, test } from "bun:test";
import { Client } from "pg";
import operations from "../migrations/app/20261001T0542_unified_recurrences/ops.json";
import contract from "../migrations/snapshots/6cd2e5e500f0c928b1e6fc63086d9eaf5867c8478fb31658bdd2857ea2eeab19/contract.json";
import { assertLocalRecurrenceTestUrl, installContractFixture } from "./contract-fixture";

const url = process.env.RECURRENCE_TEST_URL;
describe.skipIf(!url)("unified recurrence migration", () => {
	test("preserves collisions, financial links, histories, tags, debt rules and deletion identities", async () => {
		assertLocalRecurrenceTestUrl(url!);
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await client.query("BEGIN");
			await installContractFixture(client, contract);
			await client.query(`
INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner');
INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('bank','owner','Bank','CHECKING'),('card-account','owner','Card','CREDIT_CARD');
INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','card-account',1000,15,25);
INSERT INTO "Category" ("id","userId","name") VALUES ('tag','owner','Tag');
INSERT INTO "RecurringPayment" ("id","userId","name","amount","frequency","dayOfMonth","startDate","financialAccountId") VALUES ('same','owner','Expense',30,'MONTHLY',1,'2024-01-01','bank');
INSERT INTO "Subscription" ("id","userId","name","amount","frequency","billingDay","startDate","financialAccountId","materializedThrough") VALUES ('same','owner','Purchase',20,'BIWEEKLY',1,'2024-01-01','card-account','2026-09-20');
INSERT INTO "Salary" ("id","userId","source","amount","payDay","startDate","financialAccountId","materializedThrough") VALUES ('same','owner','Receipt',10,1,'2024-01-01','bank','2026-09-21');
INSERT INTO "Transaction" ("id","userId","amount","date","recurrenceId","recurrenceOccurrenceDate","originFinancialAccountId") VALUES ('expense','owner',30,'2026-09-01','same','2026-09-01','bank');
INSERT INTO "Transaction" ("id","userId","amount","date","salaryId","salaryOccurrenceDate","type","destinationFinancialAccountId") VALUES ('receipt','owner',10,'2026-09-01','same','2026-09-01','INCOME','bank');
INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","totalAmount","purchaseDate","subscriptionId","subscriptionOccurrenceDate") VALUES ('purchase','owner','card','Purchase',20,'2026-09-01','same','2026-09-01');
INSERT INTO "DebtPerson" ("id","userId","name","normalizedName") VALUES ('person','owner','Person','person');
INSERT INTO "DebtSplit" ("id","userId","mode","subscriptionId") VALUES ('split','owner','SHARES','same');
INSERT INTO "DebtSplitParticipant" ("id","debtSplitId","debtPersonId","shares","sortOrder") VALUES ('participant','split','person',1,0);
INSERT INTO "TagAssignment" ("categoryId","entityId","entityType") VALUES ('tag','same','SUBSCRIPTION'),('tag','same','SALARY');
INSERT INTO "SalaryHistory" ("id","salaryId","field","oldValue","newValue") VALUES ('history','same','amount','5','10');
`);
			for (const operation of operations)
				for (const statement of operation.execute)
					await client.query(statement.sql, "params" in statement ? statement.params : []);
			const records = (await client.query('SELECT * FROM "Recurrence" ORDER BY "legacySource"')).rows;
			expect(records).toHaveLength(3);
			expect(new Set(records.map(record => record.id)).size).toBe(3);
			const salary = records.find(record => record.legacySource === "salary");
			const subscription = records.find(record => record.legacySource === "subscription");
			expect(salary.movement).toBe("INCOME");
			expect(subscription).toMatchObject({
				creditCardId: "card",
				interval: 2,
				movement: "CARD_PURCHASE",
				unit: "WEEK",
			});
			expect(subscription.materializedThrough.toISOString().slice(0, 10)).toBe("2026-09-20");
			expect(
				(
					await client.query(
						'SELECT "recurrenceId","salaryId" FROM "Transaction" WHERE "id"=\'receipt\'',
					)
				).rows[0],
			).toEqual({ recurrenceId: salary.id, salaryId: null });
			expect(
				(await client.query('SELECT "recurringPaymentId","subscriptionId" FROM "DebtSplit"')).rows[0],
			).toEqual({ recurringPaymentId: subscription.id, subscriptionId: null });
			expect((await client.query('SELECT * FROM "RecurrenceHistory"')).rows[0].recurrenceId).toBe(
				salary.id,
			);
			expect(
				(await client.query('SELECT * FROM "TagAssignment" WHERE "entityType"=\'RECURRENCE\'')).rows,
			).toHaveLength(2);
			await client.query('DELETE FROM "Transaction" WHERE "id"=\'receipt\'');
			await client.query('DELETE FROM "CreditPurchaseRecord" WHERE "id"=\'purchase\'');
			expect(
				(await client.query('SELECT * FROM "RecurrenceOccurrence" WHERE "deletedAt" IS NOT NULL'))
					.rows,
			).toHaveLength(2);
		} finally {
			await client.query("ROLLBACK");
			await client.end();
		}
	}, 30000);
});
