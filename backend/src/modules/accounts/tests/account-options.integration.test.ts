import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase, getQueryMetrics, queryRaw, withQueryMetrics } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { listFinancialAccountOptions } from "../application/list-financial-account-options";

const url = requireFixtureUrl("DATABASE_TEST_URL");
beforeAll(async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
	await queryRaw(
		`INSERT INTO "user" (id,email,name) VALUES ('owner','options-owner@test.invalid','Owner'),('other','options-other@test.invalid','Other')`,
	);
	await queryRaw(
		`INSERT INTO "FinancialAccount" (id,"userId",name,type,currency,"isHidden") VALUES ('cash','owner','Cash','CASH','BRL',false),('visible','owner','Visible','CREDIT_CARD','BRL',false),('hidden','owner','Hidden','CREDIT_CARD','BRL',true),('foreign','other','Private','CREDIT_CARD','USD',false)`,
	);
});
afterAll(() => closeDatabase());

test("options use one query, preserve hidden accounts and omit financial/private context", async () => {
	await withQueryMetrics(async () => {
		const rows = await listFinancialAccountOptions("owner", "CREDIT_CARD");
		expect(getQueryMetrics()?.queryCount).toBe(1);
		expect(rows.map(row => row.id).sort()).toEqual(["hidden", "visible"]);
		expect(rows.find(row => row.id === "hidden")?.isHidden).toBeTrue();
		for (const row of rows)
			expect(Object.keys(row).sort()).toEqual(
				["currency", "id", "institution", "isHidden", "name", "type"].sort(),
			);
	});
});

test("unfiltered options remain user-scoped and unknown owners receive no rows", async () => {
	expect((await listFinancialAccountOptions("owner")).map(row => row.id).sort()).toEqual([
		"cash",
		"hidden",
		"visible",
	]);
	expect(await listFinancialAccountOptions("missing-owner")).toEqual([]);
});
