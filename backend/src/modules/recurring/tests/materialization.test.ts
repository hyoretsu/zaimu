import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { readFileSync } from "node:fs";
import { shiftRecurrenceDate } from "@zaimu/finance/recurrence";
import Elysia, { t } from "elysia";
import { Client } from "pg";
import contract from "../../../../../packages/sql/migrations/snapshots/11f7200adb8f9fa981d3d0aab7b6e9c8c444c027f08f182ed0a956f99a387992/contract.json";
import {
	assertLocalRecurrenceTestUrl,
	installContractFixture,
} from "../../../../../packages/sql/tests/contract-fixture";
import { RecurrenceReturn } from "../infra/elysia/RecurrenceDTO";

const url = process.env.RECURRENCE_RUNTIME_TEST_URL;
describe.skipIf(!url)("atomic recurrence processing", () => {
	let service: typeof import("../application/recurrences");
	let sql: typeof import("sql");
	const client = new Client({ connectionString: url });
	beforeAll(async () => {
		assertLocalRecurrenceTestUrl(url!);
		process.env.DATABASE_URL = url;
		await client.connect();
		await client.query("DROP SCHEMA public CASCADE; CREATE SCHEMA public");
		await installContractFixture(client, contract);
		await client.query(
			readFileSync(
				new URL(
					"../../../../../packages/sql/migrations/app/20261001T0542_unified_recurrences/backfill.sql",
					import.meta.url,
				),
				"utf8",
			),
		);
		await client.query(
			`INSERT INTO "user" ("id","email","name") VALUES ('owner','owner@example.test','Owner'); INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('a','owner','A','CHECKING'),('b','owner','B','SAVINGS'),('c','owner','Card','CREDIT_CARD'); INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','c',1000,15,25);`,
		);
		service = await import("../application/recurrences");
		sql = await import("sql");
	}, 60000);
	afterAll(async () => {
		if (sql) await sql.closeDatabase();
		await client.end();
	});
	test("five movements, concurrent retry, rail change and failure rollback", async () => {
		const today = service.recurrenceToday();
		const base = { amount: 30, interval: 1, name: "Generic", startDate: today, unit: "DAY" as const };
		for (const movement of ["INCOME", "EXPENSE", "TRANSFER", "CARD_PURCHASE", "CARD_PAYMENT"] as const) {
			const r = await service.saveRecurrence("owner", {
				...base,
				creditCardId: movement.startsWith("CARD") ? "card" : null,
				destinationFinancialAccountId: ["INCOME", "TRANSFER"].includes(movement) ? "b" : null,
				movement,
				originFinancialAccountId: ["EXPENSE", "TRANSFER", "CARD_PAYMENT"].includes(movement) ? "a" : null,
			});
			const results = await Promise.all([
				service.materializeRecurrence("owner", r.id, today),
				service.materializeRecurrence("owner", r.id, today),
			]);
			expect(results.toSorted()).toEqual([0, 1]);
			expect(await service.materializeRecurrence("owner", r.id, today)).toBe(0);
			if (movement === "EXPENSE") {
				await service.saveRecurrence(
					"owner",
					{ creditCardId: "card", movement: "CARD_PURCHASE", originFinancialAccountId: null },
					r.id,
				);
				expect(
					await service.materializeRecurrence("owner", r.id, today, { from: today, through: today }),
				).toBe(0);
			}
		}
		expect((await client.query('SELECT * FROM "RecurrenceOccurrence"')).rows).toHaveLength(5);
		expect((await client.query('SELECT * FROM "Transaction"')).rows).toHaveLength(4);
		expect((await client.query('SELECT * FROM "CreditPurchaseRecord"')).rows).toHaveLength(1);
		const r = await service.saveRecurrence("owner", {
			...base,
			movement: "EXPENSE",
			originFinancialAccountId: "a",
		});
		await client.query(
			`CREATE FUNCTION fail_transaction() RETURNS trigger LANGUAGE plpgsql AS $$ BEGIN RAISE EXCEPTION 'injected failure'; END $$; CREATE TRIGGER failure BEFORE INSERT ON "Transaction" FOR EACH ROW EXECUTE FUNCTION fail_transaction();`,
		);
		await expect(service.materializeRecurrence("owner", r.id, today)).rejects.toThrow("injected failure");
		expect(
			(await client.query('SELECT * FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1', [r.id])).rows,
		).toHaveLength(0);
		await client.query('DROP TRIGGER failure ON "Transaction"');
		expect(await service.materializeRecurrence("owner", r.id, today)).toBe(1);
	}, 30000);
	test("deleted concrete occurrence stays reserved despite date edit and replay", async () => {
		const today = service.recurrenceToday();
		const r = await service.saveRecurrence("owner", {
			amount: 20,
			interval: 1,
			movement: "EXPENSE",
			name: "Deletion",
			originFinancialAccountId: "a",
			startDate: today,
			unit: "DAY",
		});
		await service.materializeRecurrence("owner", r.id);
		await client.query('UPDATE "Transaction" SET "date"=$1 WHERE "recurrenceId"=$2', [
			shiftRecurrenceDate(today, -2),
			r.id,
		]);
		await client.query('DELETE FROM "Transaction" WHERE "recurrenceId"=$1', [r.id]);
		expect(await service.materializeRecurrence("owner", r.id, today, { from: today, through: today })).toBe(
			0,
		);
		expect(
			(await client.query('SELECT "deletedAt" FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1', [r.id]))
				.rows[0].deletedAt,
		).toBeTruthy();
	});
	test("outage catches up; pause and resume reset eligibility without rewriting history", async () => {
		const today = service.recurrenceToday();
		const start = shiftRecurrenceDate(today, -3);
		const r = await service.saveRecurrence("owner", {
			amount: 20,
			destinationFinancialAccountId: "a",
			interval: 1,
			movement: "INCOME",
			name: "Catch up",
			startDate: start,
			unit: "DAY",
		});
		await client.query('UPDATE "Recurrence" SET "materializedThrough"=$1 WHERE "id"=$2', [
			shiftRecurrenceDate(today, -4),
			r.id,
		]);
		expect(await service.materializeRecurrence("owner", r.id)).toBe(4);
		await service.saveRecurrence("owner", { isActive: false }, r.id);
		expect(await service.materializeRecurrence("owner", r.id)).toBe(0);
		await service.saveRecurrence("owner", { amount: 25, isActive: true }, r.id);
		expect(await service.materializeRecurrence("owner", r.id)).toBe(0);
		expect(
			(await client.query('SELECT "amount" FROM "Transaction" WHERE "recurrenceId"=$1', [r.id])).rows.map(
				row => Number(row.amount),
			),
		).toEqual([20, 20, 20, 20]);
		await expect(service.materializeRecurrence("owner", r.id, shiftRecurrenceDate(today, 1))).rejects.toThrow(
			"previsões",
		);
	});
	test("generic receipt can invert debt; split changes preserve occurrence snapshots", async () => {
		await client.query(
			`INSERT INTO "DebtPerson" ("id","userId","name","normalizedName") VALUES ('person','owner','Person','person'),('other','owner','Other','other');`,
		);
		const today = service.recurrenceToday();
		const split = {
			mode: "SHARES" as const,
			ownerShares: null,
			participants: [{ debtPersonId: "person", shares: 1 }],
		};
		const expense = await service.saveRecurrence("owner", {
			amount: 50,
			debtSplit: split,
			interval: 1,
			movement: "EXPENSE",
			name: "Loan repayment",
			originFinancialAccountId: "a",
			startDate: today,
			unit: "DAY",
		});
		const receipt = await service.saveRecurrence("owner", {
			amount: 70,
			debtSplit: split,
			destinationFinancialAccountId: "a",
			interval: 1,
			movement: "INCOME",
			name: "Debt receipt",
			startDate: today,
			unit: "DAY",
		});
		await service.materializeRecurrence("owner", expense.id);
		await service.materializeRecurrence("owner", receipt.id);
		expect(
			Number(
				(await client.query('SELECT SUM("effect") AS total FROM "DebtEvent" WHERE "debtPersonId"=\'person\''))
					.rows[0].total,
			),
		).toBe(-20);
		await service.saveRecurrence(
			"owner",
			{ debtSplit: { ...split, participants: [{ debtPersonId: "other", shares: 1 }] } },
			receipt.id,
		);
		expect(
			(await client.query('SELECT "debtPersonId","amount" FROM "DebtEvent" WHERE "debtPersonId"=\'person\''))
				.rows,
		).toHaveLength(2);
		expect(
			(
				await client.query(
					'SELECT * FROM "DebtSplitParticipant" p JOIN "DebtSplit" s ON s."id"=p."debtSplitId" JOIN "Transaction" t ON t."id"=s."transactionId" WHERE t."recurrenceId"=$1',
					[receipt.id],
				)
			).rows[0].debtPersonId,
		).toBe("person");
		await expect(
			service.saveRecurrence("owner", {
				amount: 10,
				debtSplit: split,
				destinationFinancialAccountId: "b",
				interval: 1,
				movement: "TRANSFER",
				name: "Forbidden",
				originFinancialAccountId: "a",
				startDate: today,
				unit: "DAY",
			}),
		).rejects.toThrow("vínculo de dívida");
	}, 30000);
	test("HTTP contract validates typed debt snapshots and sync retry preserves cursor/history", async () => {
		const recurrences = await service.listRecurrences("owner");
		const app = new Elysia().get("/", () => recurrences, { response: t.Array(RecurrenceReturn) });
		const response = await app.handle(new Request("http://localhost/"));
		expect(response.status).toBe(200);
		expect(await response.json()).toHaveLength(recurrences.length);
		const auth = await import("~/modules/auth");
		mock.module("~/modules/auth", () => ({ ...auth, requireUserId: async () => "owner" }));
		const { RecurringController } = await import("../infra/elysia/RecurringController");
		const legacy = await RecurringController.handle(
			new Request("http://localhost/recurring/", {
				body: JSON.stringify({
					amount: 12,
					financialAccountId: "a",
					frequency: "BIWEEKLY",
					name: "Legacy payment",
					paymentMethod: "PIX",
					startDate: service.recurrenceToday(),
				}),
				headers: { "Content-Type": "application/json" },
				method: "POST",
			}),
		);
		expect(legacy.status).toBe(200);
		const migrated = (await legacy.json()) as { unit: string; interval: number };
		expect(migrated.unit).toBe("WEEK");
		expect(migrated.interval).toBe(2);
		const { SyncController } = await import("~/modules/sync/SyncController");
		const request = (body: unknown) =>
			SyncController.handle(
				new Request("http://localhost/sync/", {
					body: JSON.stringify(body),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}),
			);
		const data = {
			creditCards: [{ creditLimit: 1000, dueDay: 25, financialAccountId: "c", id: "card", statementDay: 15 }],
			debtPeople: [
				{ id: "person", name: "Person" },
				{ id: "other", name: "Other" },
			],
			financialAccounts: [
				{ id: "a", name: "A", type: "CHECKING" },
				{ id: "b", name: "B", type: "SAVINGS" },
				{ id: "c", name: "Card", type: "CREDIT_CARD" },
			],
			recurrences,
		};
		const history = (await client.query('SELECT * FROM "RecurrenceHistory"')).rows.length;
		const count = (await client.query('SELECT * FROM "Transaction"')).rows.length;
		for (let i = 0; i < 2; i++) {
			const result = await request(data);
			expect(result.status).toBe(200);
			const body = (await result.json()) as { syncResults: { recurrences: { errors: unknown[] } } };
			expect(body.syncResults.recurrences.errors).toEqual([]);
		}
		expect((await client.query('SELECT * FROM "RecurrenceHistory"')).rows).toHaveLength(history);
		expect((await client.query('SELECT * FROM "Transaction"')).rows).toHaveLength(count);
		const invalid = {
			...data,
			recurrences: [
				{
					amount: 10,
					id: "failed-import",
					interval: 1,
					materializedThrough: "2026-09-20",
					movement: "EXPENSE",
					name: "Import",
					originFinancialAccountId: "a",
					startDate: "2026-09-01",
					unit: "DAY",
				},
			],
			transactions: [
				{
					amount: 10,
					date: "2026-09-21",
					id: "failed-transaction",
					originFinancialAccountId: "missing",
					recurrenceId: "failed-import",
					recurrenceOccurrenceDate: "2026-09-21",
					type: "EXPENSE",
				},
			],
		};
		const failure = await request(invalid);
		expect(failure.status).not.toBe(200);
		expect((await client.query('SELECT * FROM "Recurrence" WHERE "id"=\'failed-import\'')).rows).toHaveLength(
			0,
		);
	}, 60000);
});
