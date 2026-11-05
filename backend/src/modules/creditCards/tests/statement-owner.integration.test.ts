import { afterAll, beforeAll, expect, test } from "bun:test";
import { createHmac } from "node:crypto";
import Elysia from "elysia";
import { Client } from "pg";
import { closeDatabase, getQueryMetrics, withQueryMetrics } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");
let client: Client;
let app: Pick<Elysia, "handle">;
let cookie: string;
beforeAll(async () => {
	client = new Client({ connectionString: url });
	await client.connect();
	await installContractFixture(client, contract);
	await client.query(`INSERT INTO "user" (id,email,name) VALUES ('owner','owner@test.invalid','Owner'),('other','other@test.invalid','Other');
 INSERT INTO "FinancialAccount" (id,"userId",name,type) VALUES ('account','owner','Card','CREDIT_CARD'),('other-account','other','Other','CREDIT_CARD');
 INSERT INTO "CreditCard" (id,"financialAccountId","creditLimit","statementDay","dueDay") VALUES ('card','account',100,1,5),('other-card','other-account',100,1,5);
 INSERT INTO "CreditCardStatement" (id,"creditCardId","statementDate","dueDate") VALUES ('invoice','card','2026-10-01','2026-10-05'),('other-invoice','other-card','2026-10-01','2026-10-05');
 INSERT INTO "session" (id,token,"userId","expiresAt") VALUES ('owner-session','owner-session','owner',now()+interval '7 days')`);
	const { CreditCardsController } = await import("../infra/elysia/CreditCardsController");
	const { HttpException } = await import("~/shared/errors");
	app = new Elysia()
		.error({ HttpException })
		.onError(({ error, set }) => {
			if (error instanceof HttpException) {
				set.status = error.statusCode;
				return { error: error.message };
			}
		})
		.use(CreditCardsController);
	const { auth } = await import("~/modules/auth/auth");
	const context = await auth.$context;
	const token = "owner-session";
	cookie = `${context.authCookies.sessionToken.name}=${encodeURIComponent(`${token}.${createHmac("sha256", context.secret).update(token).digest("base64")}`)}`;
});
afterAll(async () => {
	await client?.end();
	await closeDatabase();
});
const request = (id: string, authenticated = true) =>
	app.handle(
		new Request(`http://localhost/credit-cards/statement-owner/${id}`, {
			headers: authenticated ? { cookie } : {},
		}),
	);
test("statement lookup requires authenticated session", async () => {
	expect((await request("invoice", false)).status).toBe(401);
});
test("statement owner uses one business SQL read without loading financial history", async () => {
	expect(await (await request("invoice")).json()).toEqual({ creditCardId: "card" });
	await withQueryMetrics(async () => {
		const response = await request("invoice");
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ creditCardId: "card" });
		expect(getQueryMetrics()?.businessQueryCount).toBe(1);
	});
});
for (const id of ["missing", "other-invoice"])
	test(`${id} returns same explicit empty ownership response`, async () => {
		const response = await request(id);
		expect(response.status).toBe(200);
		expect(await response.json()).toEqual({ creditCardId: null });
	});
