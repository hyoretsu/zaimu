import { afterAll, beforeAll, expect, mock, test } from "bun:test";
import { format } from "date-fns";
import { Elysia } from "elysia";
import { Client } from "pg";
import { closeDatabase, queryRaw } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

// Non-UTC regression: calendar days must stay local, as with the previous driver.
const previousTimeZone = process.env.TZ;
process.env.TZ = "America/Sao_Paulo";
const url = requireFixtureUrl("DATABASE_TEST_URL");
let currentUser = "owner";
const enqueued: unknown[][] = [];
mock.module("~/modules/auth", () => ({ requireUserId: async () => currentUser }));
mock.module("~/modules/reference-rates/application/reference-rate-jobs", () => ({
	enqueueAccountYieldRecalculation: async (...args: unknown[]) => {
		enqueued.push(args);
	},
}));

const { BalanceAdjustmentsController } = await import("../infra/elysia/BalanceAdjustmentsController");
const { GlobalPlugin } = await import("~/shared/infra/elysia/global");
// Product error mapping (HttpException -> status) lives in GlobalPlugin, as in the real app.
const app = new Elysia().use(GlobalPlugin).use(BalanceAdjustmentsController);
const call = (method: string, path: string, body?: unknown) =>
	app.handle(
		new Request(`http://localhost/balance-adjustments${path}`, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: { "content-type": "application/json" },
			method,
		}),
	);

beforeAll(async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
	await queryRaw(
		`INSERT INTO "user" (id,email,name) VALUES ('owner','adj-owner@test.invalid','Owner'),('other','adj-other@test.invalid','Other')`,
	);
	await queryRaw(
		`INSERT INTO "FinancialAccount" (id,"userId",name,type,currency) VALUES ('a1','owner','Main','CHECKING','BRL'),('a2','owner','Second','CHECKING','BRL'),('card','owner','Card','CREDIT_CARD','BRL'),('foreign','other','Foreign','CHECKING','BRL')`,
	);
});
afterAll(async () => {
	if (previousTimeZone === undefined) delete process.env.TZ;
	else process.env.TZ = previousTimeZone;
	await closeDatabase();
});

test("create, list, update, conflict, ownership and delete preserve semantics", async () => {
	const created = await call("POST", "/", { balance: 10.5, date: "2026-01-10", financialAccountId: "a1" });
	expect(created.status).toBe(200);
	// Guard: the runtime must really be non-UTC, otherwise the local-day assertions prove nothing.
	expect(new Date("2026-01-10T00:00:00").getTimezoneOffset()).toBe(180);
	const adjustment = (await created.json()) as { balance: number; date: string; id: string };
	expect(adjustment.balance).toBe(10.5);
	expect(format(new Date(adjustment.date), "yyyy-MM-dd")).toBe("2026-01-10");
	expect(adjustment.date).toBe("2026-01-10T03:00:00.000Z");
	expect(enqueued.at(-1)?.[2]).toBe(`balance-adjustment:${adjustment.id}`);

	expect(
		(await call("POST", "/", { balance: 1, date: "2026-01-10", financialAccountId: "a1" })).status,
	).toBe(409);
	expect(
		(await call("POST", "/", { balance: 1, date: "2026-01-10", financialAccountId: "card" })).status,
	).toBe(400);
	expect(
		(await call("POST", "/", { balance: 1, date: "2026-01-10", financialAccountId: "foreign" })).status,
	).toBe(400);

	const second = (await (
		await call("POST", "/", { balance: 2, date: "2026-01-11", financialAccountId: "a1" })
	).json()) as { id: string };
	const list = (await (await call("GET", "/")).json()) as { date: string; id: string; name: string }[];
	expect(list.map(row => row.id)).toEqual([second.id, adjustment.id]);
	expect(format(new Date(list[1]!.date), "yyyy-MM-dd")).toBe("2026-01-10");
	expect(list[0]!.name).toBe("Main");

	expect(
		(
			await call("PATCH", `/${adjustment.id}`, {
				balance: 1,
				date: "2026-01-11",
				financialAccountId: "a1",
			})
		).status,
	).toBe(409);
	const patched = await call("PATCH", `/${adjustment.id}`, {
		balance: 20.25,
		date: "2026-01-12",
		financialAccountId: "a2",
	});
	expect(patched.status).toBe(200);
	const [row] = await queryRaw<{ balance: number; date: Date; financialAccountId: string }>(
		`SELECT balance, date, "financialAccountId" FROM "BalanceAdjustment" WHERE id=$1`,
		[adjustment.id],
	);
	expect(row).toMatchObject({ balance: 20.25, financialAccountId: "a2" });

	currentUser = "other";
	expect((await call("DELETE", `/${adjustment.id}`)).status).toBe(404);
	expect(
		(
			await call("PATCH", `/${adjustment.id}`, {
				balance: 1,
				date: "2026-01-12",
				financialAccountId: "foreign",
			})
		).status,
	).toBe(404);
	currentUser = "owner";
	expect((await call("DELETE", `/${adjustment.id}`)).status).toBe(200);
	expect(format(enqueued.at(-1)![1] as Date, "yyyy-MM-dd")).toBe("2026-01-12");
	expect(enqueued.at(-1)?.[2]).toBe(`balance-adjustment-delete:${adjustment.id}`);
	expect((await call("DELETE", `/${adjustment.id}`)).status).toBe(404);
});
