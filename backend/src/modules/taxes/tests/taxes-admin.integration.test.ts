import { afterAll, beforeAll, describe, expect, mock, test } from "bun:test";
import { Elysia } from "elysia";
import { Client } from "pg";
import { closeDatabase, queryRaw } from "sql";
import { GlobalPlugin } from "~/shared/infra/elysia/global";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");
let currentUser = "admin";
const enqueued: string[] = [];
mock.module("~/modules/auth", () => ({ requireUserId: async () => currentUser }));
mock.module("~/modules/reference-rates/application/reference-rate-jobs", () => ({
	enqueueAccountYieldRecalculation: async (accountId: string) => {
		enqueued.push(accountId);
	},
}));

const { TaxesController } = await import("../TaxesController");
const app = new Elysia().use(GlobalPlugin).use(TaxesController);
const call = (method: string, path: string, body?: unknown) =>
	app.handle(
		new Request(`http://localhost${path}`, {
			body: body === undefined ? undefined : JSON.stringify(body),
			headers: { "content-type": "application/json" },
			method,
		}),
	);
const brackets = [{ rate: 15, upToDays: null }];

describe("tax administration", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
			await client.query("SET session_replication_role = replica");
			await client.query(
				`INSERT INTO "user" ("id","email","name","role") VALUES
				 ('admin','Admin.Boss@test.invalid','Admin','ADMIN'),('plain','plain@test.invalid','Plain','USER'),
				 ('u1','zed@test.invalid','Zed','USER'),('u2','alice@test.invalid','Alice','USER')`,
			);
			await client.query(
				`INSERT INTO "FinancialAccount" ("id","userId","type") VALUES
				 ('acc-check','plain','CHECKING'),('acc-card','plain','CREDIT_CARD'),('acc-save','plain','SAVINGS')`,
			);
		} finally {
			await client.end();
		}
	});
	afterAll(() => closeDatabase());

	test("create inserts the definition and version and recalculates only non-card accounts", async () => {
		currentUser = "admin";
		enqueued.length = 0;
		const response = await call("POST", "/admin/taxes", {
			applicationOrder: 1,
			brackets,
			name: "  IR  ",
		});
		expect(response.status).toBe(200);
		const { id } = (await response.json()) as { id: string };
		const definition = await queryRaw<{ isActive: boolean; name: string }>(
			'SELECT "name","isActive" FROM "taxDefinition" WHERE "id"=$1',
			[id],
		);
		expect(definition).toEqual([{ isActive: true, name: "IR" }]);
		expect(
			(await queryRaw('SELECT 1 FROM "taxDefinitionVersion" WHERE "taxDefinitionId"=$1', [id])).length,
		).toBe(1);
		expect([...enqueued].sort()).toEqual(["acc-check", "acc-save"]);
	});

	test("update renames in place, upserts the same-day version and 404s for unknown ids", async () => {
		currentUser = "admin";
		const created = (await (
			await call("POST", "/admin/taxes", { applicationOrder: 1, brackets, name: "CSLL" })
		).json()) as {
			id: string;
		};
		const updated = await call("PUT", `/admin/taxes/${created.id}`, {
			applicationOrder: 7,
			brackets,
			name: "CSLL 2",
		});
		expect(updated.status).toBe(200);
		expect(await queryRaw('SELECT "name" FROM "taxDefinition" WHERE "id"=$1', [created.id])).toEqual([
			{ name: "CSLL 2" },
		]);
		expect(
			await queryRaw(
				'SELECT "applicationOrder" FROM "taxDefinitionVersion" WHERE "taxDefinitionId"=$1',
				[created.id],
			),
		).toEqual([{ applicationOrder: 7 }]);
		expect(
			(await call("PUT", "/admin/taxes/missing", { applicationOrder: 1, brackets, name: "X" })).status,
		).toBe(404);
		expect((await call("PATCH", "/admin/taxes/missing", { isActive: false })).status).toBe(404);
		expect((await call("PATCH", `/admin/taxes/${created.id}`, { isActive: false })).status).toBe(200);
		expect(await queryRaw('SELECT "isActive" FROM "taxDefinition" WHERE "id"=$1', [created.id])).toEqual([
			{ isActive: false },
		]);
	});

	test("user search is case-insensitive, ordered by email, minimum three characters and admin only", async () => {
		currentUser = "admin";
		const names = async (email: string) =>
			(
				(await (await call("GET", `/admin/users?email=${encodeURIComponent(email)}`)).json()) as {
					email: string;
				}[]
			).map(row => row.email);
		expect(await names("TEST.INVALID")).toEqual([
			"Admin.Boss@test.invalid",
			"alice@test.invalid",
			"plain@test.invalid",
			"zed@test.invalid",
		]);
		expect(await names("BOSS")).toEqual(["Admin.Boss@test.invalid"]);
		expect(await names("ab")).toEqual([]);
		currentUser = "plain";
		expect((await call("GET", "/admin/users?email=boss")).status).toBe(403);
	});
});
