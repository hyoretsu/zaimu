import { afterAll, beforeAll, expect, mock, setSystemTime, test } from "bun:test";
import Elysia from "elysia";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const url = requireFixtureUrl("RECURRENCE_RUNTIME_TEST_URL");
const client = new Client({ connectionString: url });
let sql: typeof import("sql");
let app: Pick<Elysia, "handle">;
const userId = "time-zone-owner";

beforeAll(async () => {
	process.env.DATABASE_URL = url;
	await client.connect();
	await client.query(
		`INSERT INTO "user" ("id","email","name") VALUES ('time-zone-owner','time-zone@example.test','Timezone'); INSERT INTO "FinancialAccount" ("id","userId","name","type") VALUES ('tz-account','time-zone-owner','Account','CHECKING'),('tz-card-account','time-zone-owner','Card','CREDIT_CARD'); INSERT INTO "CreditCard" ("id","financialAccountId","creditLimit","statementDay","dueDay") VALUES ('tz-card','tz-card-account',1000,15,25)`,
	);
	sql = await import("sql");
	const auth = await import("~/modules/auth");
	mock.module("~/modules/auth", () => ({ ...auth, requireUserId: async () => userId }));
	const { CountryPreferencesController } = await import("~/modules/yield-calendar/country-preference");
	const { GlobalPlugin } = await import("~/shared/infra/elysia/global");
	app = new Elysia().use(GlobalPlugin).use(CountryPreferencesController);
}, 60000);

afterAll(async () => {
	setSystemTime();
	if (sql) await sql.closeDatabase();
	await client.end();
});

async function preference(value?: string | null) {
	return app.handle(
		new Request(
			"http://localhost/time-zone-preferences",
			value === undefined
				? {}
				: {
						body: JSON.stringify({ preferredTimeZone: value }),
						headers: { "Content-Type": "application/json" },
						method: "PATCH",
					},
		),
	);
}

test("timezone preference defaults by country, validates writes and restores automatic mode", async () => {
	expect(await (await preference()).json()).toMatchObject({
		defaultTimeZone: "GMT",
		preferredTimeZone: null,
		timeZone: "GMT",
	});
	await client.query('UPDATE "user" SET "preferredCountry"=$2 WHERE "id"=$1', [userId, "BR"]);
	expect(await (await preference()).json()).toMatchObject({
		defaultTimeZone: "America/Sao_Paulo",
		timeZone: "America/Sao_Paulo",
	});
	const saved = await preference("America/Rio_Branco");
	expect(saved.status).toBe(200);
	expect(await saved.json()).toMatchObject({
		preferredTimeZone: "America/Rio_Branco",
		timeZone: "America/Rio_Branco",
	});
	await client.query('UPDATE "user" SET "preferredCountry"=$2 WHERE "id"=$1', [userId, "US"]);
	expect(await (await preference()).json()).toMatchObject({
		defaultTimeZone: "America/New_York",
		timeZone: "America/Rio_Branco",
	});
	expect((await preference("Mars/Olympus")).status).toBe(400);
	expect((await preference("x".repeat(101))).status).toBe(422);
	expect(await (await preference()).json()).toMatchObject({ preferredTimeZone: "America/Rio_Branco" });
	expect(await (await preference(null)).json()).toMatchObject({
		preferredTimeZone: null,
		timeZone: "America/New_York",
	});
});

test("explicit regional timezone governs recurrence guards, worker cutoff and installments", async () => {
	const service = await import("../application/recurrences");
	const { mutateCreditBook } = await import("~/modules/creditCards/application/normalized-credit-book");
	const { userFinancialDate } = await import("~/shared/application/financial-date");
	const { materializeCreditCardSchedules } =
		await import("~/modules/creditCards/application/materialize-credit-card-schedules");
	await client.query('UPDATE "user" SET "preferredCountry"=$2,"preferredTimeZone"=$3 WHERE "id"=$1', [
		userId,
		"BR",
		"America/Rio_Branco",
	]);
	try {
		setSystemTime(new Date("2026-10-26T03:00:00Z"));
		expect(await userFinancialDate(userId)).toBe("2026-10-25");
		const catchup = await service.saveRecurrence(userId, {
			amount: 30,
			creditCardId: "tz-card",
			installments: 3,
			interval: 1,
			movement: "CARD_PURCHASE",
			name: "Historical recovery",
			startDate: "2026-09-26",
			unit: "YEAR",
		});
		expect(
			await service.materializeRecurrence(userId, catchup.id, "2026-10-25", {
				from: "2026-09-26",
				through: "2026-10-25",
			}),
		).toBe(1);
		expect(
			Number(
				(
					await client.query(
						'SELECT count(*) AS count FROM "CreditInstallmentRecord" WHERE "purchaseId" IN (SELECT "id" FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1)',
						[catchup.id],
					)
				).rows[0].count,
			),
		).toBe(1);

		const recurrence = await service.saveRecurrence(userId, {
			amount: 30,
			creditCardId: "tz-card",
			installments: 3,
			interval: 1,
			movement: "CARD_PURCHASE",
			name: "Regional purchase",
			startDate: "2026-10-26",
			unit: "YEAR",
		});
		expect(recurrence.materializedThrough).toBe("2026-10-24");
		expect((await service.materializeAllRecurrences(new Date(), [userId])).transactions).toBe(0);
		await expect(service.materializeRecurrence(userId, recurrence.id, "2026-10-26")).rejects.toThrow(
			"Ocorrências futuras",
		);
		setSystemTime(new Date("2026-10-26T05:00:00Z"));
		expect((await service.materializeAllRecurrences(new Date(), [userId])).transactions).toBe(1);
		expect((await service.materializeAllRecurrences(new Date(), [userId])).transactions).toBe(0);
		const count = async () =>
			Number(
				(
					await client.query(
						'SELECT count(*) AS count FROM "CreditInstallmentRecord" WHERE "purchaseId" IN (SELECT "id" FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1)',
						[recurrence.id],
					)
				).rows[0].count,
			);
		setSystemTime(new Date("2026-11-26T03:00:00Z"));
		await mutateCreditBook(userId, "tz-card", () => undefined);
		expect(await count()).toBe(1);
		await materializeCreditCardSchedules(new Date("2026-11-26T03:00:00Z"), ["tz-card"]);
		expect(await count()).toBe(1);
		await materializeCreditCardSchedules(new Date("2026-11-26T05:00:00Z"), ["tz-card"]);
		expect(await count()).toBe(2);
	} finally {
		setSystemTime();
	}
});
