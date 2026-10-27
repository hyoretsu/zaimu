import { afterAll, beforeAll, describe, expect, mock, setSystemTime, test } from "bun:test";
import { shiftRecurrenceDate } from "@zaimu/finance/recurrence";
import Elysia, { t } from "elysia";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { RecurrenceReturn } from "../infra/elysia/RecurrenceDTO";

const url = requireFixtureUrl("RECURRENCE_RUNTIME_TEST_URL");
describe("atomic recurrence processing", () => {
	let service: typeof import("../application/recurrences");
	let sql: typeof import("sql");
	const client = new Client({ connectionString: url });
	beforeAll(async () => {
		process.env.DATABASE_URL = url;
		await client.connect();

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
				installments: movement === "CARD_PURCHASE" ? 3 : 1,
				movement,
				originFinancialAccountId: ["EXPENSE", "TRANSFER", "CARD_PAYMENT"].includes(movement)
					? "a"
					: null,
			});
			const results = await Promise.all([
				service.materializeRecurrence("owner", r.id, today),
				service.materializeRecurrence("owner", r.id, today),
			]);
			expect(results.toSorted()).toEqual([0, 1]);
			expect(await service.materializeRecurrence("owner", r.id, today)).toBe(0);
			if (movement === "CARD_PURCHASE") {
				expect(r.installments).toBe(3);
				const installments = (
					await client.query(
						'SELECT i."amount" FROM "CreditInstallmentPlan" i JOIN "CreditPurchaseRecord" p ON p."id"=i."purchaseId" WHERE p."recurrenceId"=$1 ORDER BY i."number"',
						[r.id],
					)
				).rows;
				expect(installments).toHaveLength(3);
				expect(installments.map(row => Number(row.amount))).toEqual([10, 10, 10]);
				expect(
					(
						await client.query(
							'SELECT count(*)::integer AS count FROM "CreditInstallmentRecord" i JOIN "CreditPurchaseRecord" p ON p."id"=i."purchaseId" WHERE p."recurrenceId"=$1',
							[r.id],
						)
					).rows[0].count,
				).toBe(1);
			}
			if (movement === "EXPENSE") {
				await service.saveRecurrence(
					"owner",
					{ creditCardId: "card", movement: "CARD_PURCHASE", originFinancialAccountId: null },
					r.id,
				);
				expect(
					await service.materializeRecurrence("owner", r.id, today, {
						from: today,
						through: today,
					}),
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
	test("advancing keeps scheduled identity and optional time without moving materialization cursor", async () => {
		const today = service.recurrenceToday();
		const scheduled = shiftRecurrenceDate(today, 2);
		for (const movement of ["EXPENSE", "CARD_PURCHASE"] as const) {
			const r = await service.saveRecurrence("owner", {
				amount: 20,
				creditCardId: movement === "CARD_PURCHASE" ? "card" : null,
				interval: 1,
				movement,
				name: "Advance",
				originFinancialAccountId: movement === "EXPENSE" ? "a" : null,
				startDate: scheduled,
				unit: "MONTH",
			});
			expect(
				await service.materializeRecurrence("owner", r.id, undefined, undefined, { time: "14:30" }),
			).toBe(1);
			const table = movement === "EXPENSE" ? "Transaction" : "CreditPurchaseRecord";
			const field = movement === "EXPENSE" ? "date" : "purchaseDate";
			const [row] = (
				await client.query(
					`SELECT "${field}"::text AS "date", "time"::text, "recurrenceOccurrenceDate"::text AS "scheduled" FROM "${table}" WHERE "recurrenceId"=$1`,
					[r.id],
				)
			).rows;
			expect(row).toEqual({ date: today, scheduled, time: "14:30:00" });
			expect((await service.getStoredRecurrence("owner", r.id)).materializedThrough).toBe(
				r.materializedThrough,
			);
			await expect(
				service.materializeRecurrence("owner", r.id, undefined, undefined, {}),
			).rejects.toThrow("já foi adiantada");
			expect(await service.materializeRecurrence("owner", r.id, today)).toBe(0);
		}
	});
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
		expect(
			await service.materializeRecurrence("owner", r.id, today, { from: today, through: today }),
		).toBe(0);
		expect(
			(
				await client.query('SELECT "deletedAt" FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1', [
					r.id,
				])
			).rows[0].deletedAt,
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
			(
				await client.query('SELECT "amount" FROM "Transaction" WHERE "recurrenceId"=$1', [r.id])
			).rows.map(row => Number(row.amount)),
		).toEqual([20, 20, 20, 20]);
		await expect(
			service.materializeRecurrence("owner", r.id, shiftRecurrenceDate(today, 1)),
		).rejects.toThrow("previsões");
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
				(
					await client.query(
						'SELECT SUM("effect") AS total FROM "DebtEvent" WHERE "debtPersonId"=\'person\'',
					)
				).rows[0].total,
			),
		).toBe(-20);
		await service.saveRecurrence(
			"owner",
			{ debtSplit: { ...split, participants: [{ debtPersonId: "other", shares: 1 }] } },
			receipt.id,
		);
		expect(
			(
				await client.query(
					'SELECT "debtPersonId","amount" FROM "DebtEvent" WHERE "debtPersonId"=\'person\'',
				)
			).rows,
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
		const { SyncController } = await import("~/modules/sync/SyncController");
		const { GlobalPlugin } = await import("~/shared/infra/elysia/global");
		const http = new Elysia().use(GlobalPlugin).use(RecurringController).use(SyncController);
		const legacy = await http.handle(
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
		expect(legacy.status).toBe(422);
		const request = (body: unknown) =>
			http.handle(
				new Request("http://localhost/sync/", {
					body: JSON.stringify(body),
					headers: { "Content-Type": "application/json" },
					method: "POST",
				}),
			);
		// Dependencies already exist on the server; sync the recurrence snapshots under test.
		const data = { recurrences };
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
		expect(
			(await client.query('SELECT * FROM "Recurrence" WHERE "id"=\'failed-import\'')).rows,
		).toHaveLength(0);
	}, 60000);
	test("Brazilian recurrences wait for local midnight even after the UTC date changes", async () => {
		setSystemTime(new Date("2026-10-26T01:21:00Z"));
		try {
			await client.query(
				`INSERT INTO "user" ("id","email","name","preferredCountry") VALUES ('timezone-owner','timezone@example.test','Timezone','BR'); INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('timezone-account','timezone-owner','Account','CHECKING')`,
			);
			const recurrence = await service.saveRecurrence("timezone-owner", {
				amount: 15,
				interval: 1,
				movement: "EXPENSE",
				name: "Local midnight",
				originFinancialAccountId: "timezone-account",
				startDate: "2026-10-26",
				unit: "MONTH",
			});
			expect(recurrence.materializedThrough).toBe("2026-10-24");
			expect(
				(await service.materializeAllRecurrences(new Date(), ["timezone-owner"])).transactions,
			).toBe(0);
			await expect(
				service.materializeRecurrence("timezone-owner", recurrence.id, "2026-10-26"),
			).rejects.toThrow("Ocorrências futuras");
			await client.query(
				`INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('timezone-card-account','timezone-owner','Card','CREDIT_CARD'); INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('timezone-card','timezone-card-account',1000,15,25)`,
			);
			const purchase = await service.saveRecurrence("timezone-owner", {
				amount: 30,
				creditCardId: "timezone-card",
				installments: 3,
				interval: 1,
				movement: "CARD_PURCHASE",
				name: "Card local midnight",
				startDate: "2026-10-26",
				unit: "YEAR",
			});
			expect(await service.materializeRecurrence("timezone-owner", purchase.id)).toBe(0);
			setSystemTime(new Date("2026-10-26T03:00:00Z"));
			expect(
				(await service.materializeAllRecurrences(new Date(), ["timezone-owner"])).transactions,
			).toBe(2);
			expect(
				(await service.materializeAllRecurrences(new Date(), ["timezone-owner"])).transactions,
			).toBe(0);
			const { materializeCreditCardSchedules } =
				await import("../../creditCards/application/materialize-credit-card-schedules");
			await materializeCreditCardSchedules(new Date("2026-11-26T01:21:00Z"), ["timezone-card"]);
			const installmentCount = async () =>
				Number(
					(
						await client.query(
							'SELECT count(*) AS count FROM "CreditInstallmentRecord" WHERE "purchaseId" IN (SELECT "id" FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1)',
							[purchase.id],
						)
					).rows[0].count,
				);
			expect(await installmentCount()).toBe(1);
			await materializeCreditCardSchedules(new Date("2026-11-26T03:00:00Z"), ["timezone-card"]);
			expect(await installmentCount()).toBe(2);
		} finally {
			setSystemTime();
		}
	});
	test("associating existing records reserves replay identity without changing financial IDs", async () => {
		const { associateRecurrence } = await import("../application/associate-recurrence");
		const date = `${shiftRecurrenceDate(`${service.recurrenceToday().slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
		const through = shiftRecurrenceDate(date, 20);
		for (const kind of ["TRANSACTION", "PURCHASE"] as const) {
			const purchase = kind === "PURCHASE";
			const recordId = `associated-${kind}`;
			const recurrence = await service.saveRecurrence("owner", {
				amount: 30,
				creditCardId: purchase ? "card" : null,
				dayOfMonth: 1,
				interval: 1,
				movement: purchase ? "CARD_PURCHASE" : "EXPENSE",
				name: "Associated",
				originFinancialAccountId: purchase ? null : "a",
				startDate: date,
				unit: "MONTH",
			});
			if (purchase)
				await client.query(
					`WITH purchase AS (INSERT INTO "CreditPurchaseRecord" ("id","userId","creditCardId","description","purchaseDate","totalAmount","externalId") VALUES ($1,'owner','card','Existing',$2,25,'associated-external') RETURNING "id") INSERT INTO "CreditInstallmentPlan" ("purchaseId","number","amount") SELECT "id",1,25 FROM purchase`,
					[recordId, date],
				);
			else
				await client.query(
					`INSERT INTO "Transaction" ("id","userId","originFinancialAccountId","type","date","amount") VALUES ($1,'owner','a','EXPENSE',$2,25)`,
					[recordId, date],
				);
			const input = { date: shiftRecurrenceDate(date, 2), kind, recordId };
			await expect(associateRecurrence("another-user", recurrence.id, input)).rejects.toThrow(
				"encontrada",
			);
			await Promise.all([
				associateRecurrence("owner", recurrence.id, input),
				associateRecurrence("owner", recurrence.id, input),
			]);
			await associateRecurrence("owner", recurrence.id, {
				...input,
				date: shiftRecurrenceDate(date, 10),
			});
			await service.saveRecurrence(
				"owner",
				{ amount: 40, dayOfMonth: 15, name: "Edited" },
				recurrence.id,
			);
			expect(
				await service.materializeRecurrence("owner", recurrence.id, through, { from: date, through }),
			).toBe(0);
			const table = purchase ? "CreditPurchaseRecord" : "Transaction";
			const rows = (
				await client.query(`SELECT * FROM "${table}" WHERE "recurrenceId"=$1`, [recurrence.id])
			).rows;
			expect(rows).toHaveLength(1);
			expect(rows[0].id).toBe(recordId);
			expect(Number(purchase ? rows[0].totalAmount : rows[0].amount)).toBe(25);
			if (purchase) expect(rows[0].externalId).toBe("associated-external");
			if (!purchase) {
				await client.query(
					`INSERT INTO "Transaction" ("id","userId","originFinancialAccountId","type","date","amount") VALUES ('association-conflict','owner','a','EXPENSE',$1,25)`,
					[date],
				);
				await expect(
					associateRecurrence("owner", recurrence.id, {
						...input,
						recordId: "association-conflict",
					}),
				).rejects.toThrow("já foi processado");
				expect(
					(
						await client.query(
							`SELECT "recurrenceId" FROM "Transaction" WHERE "id"='association-conflict'`,
						)
					).rows[0].recurrenceId,
				).toBeNull();
			}
		}
	});

	test("normal monthly generation retains occupied period after changing its day", async () => {
		const date = `${shiftRecurrenceDate(`${service.recurrenceToday().slice(0, 7)}-01`, -1).slice(0, 7)}-01`;
		const through = shiftRecurrenceDate(date, 20);
		for (const movement of ["EXPENSE", "CARD_PURCHASE"] as const) {
			const recurrence = await service.saveRecurrence("owner", {
				amount: 50,
				creditCardId: movement === "CARD_PURCHASE" ? "card" : null,
				dayOfMonth: 1,
				interval: 1,
				movement,
				name: "Period identity",
				originFinancialAccountId: movement === "EXPENSE" ? "a" : null,
				startDate: date,
				unit: "MONTH",
			});
			expect(
				await service.materializeRecurrence("owner", recurrence.id, through, { from: date, through }),
			).toBe(1);
			await service.saveRecurrence("owner", { dayOfMonth: 15 }, recurrence.id);
			expect(
				await service.materializeRecurrence("owner", recurrence.id, through, { from: date, through }),
			).toBe(0);
			expect(
				(
					await client.query('SELECT * FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1', [
						recurrence.id,
					])
				).rows,
			).toHaveLength(1);
		}
	});
});
