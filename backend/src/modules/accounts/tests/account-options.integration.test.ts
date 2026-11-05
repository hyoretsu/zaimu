import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "pg";
import {
	closeDatabase,
	db,
	getQueryMetrics,
	nullableNumeric,
	queryRaw,
	queryRows,
	withQueryMetrics,
} from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { financialAccountContextSql } from "../application/financial-account-context-sql";
import { getFinancialInstitutionYieldPolicies } from "../application/get-financial-institution-yield-policies";
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

test("full context resolves only owned accounts and never exposes internal planner columns", async () => {
	await withQueryMetrics(async () => {
		const rows = await queryRaw<{ account: { id: string; type: string }; card: unknown }>(
			financialAccountContextSql,
			["owner"],
		);
		expect(getQueryMetrics()?.queryCount).toBe(1);
		expect(rows.map(row => row.account.id).sort()).toEqual(["cash", "hidden", "visible"]);
		for (const row of rows) {
			expect(row.account).not.toHaveProperty("resolved_card_rules");
			expect(row.account).not.toHaveProperty("balance");
		}
	});
});

// ORM-origin DATE values historically reached domain code as UTC-midnight Dates.
// Keep that boundary stable even when the application's local calendar day differs.
test("builder DATE writes and policy domain dates remain stable in UTC and non-UTC zones", async () => {
	await queryRaw(
		`INSERT INTO "FinancialInstitution" (id,name,"normalizedName",currency) VALUES ('date-policy-institution','Date policy institution','date-policy-institution','BRL')`,
	);
	const previousTimezone = process.env.TZ;
	try {
		for (const [index, timezone] of ["UTC", "America/Sao_Paulo"].entries()) {
			process.env.TZ = timezone;
			const id = `date-policy-${index}`;
			const [written] = await queryRows(
				db.sql.public.FinancialInstitutionYieldPolicy.insert([
					{
						countryCode: null,
						currency: "BRL",
						effectiveDate: "2026-03-01",
						effectiveUntil: "2026-03-31",
						financialInstitutionId: "date-policy-institution",
						id,
						profileId: null,
						yieldTaxRate: nullableNumeric<5, 2>(null),
					},
				])
					.returning("id", "effectiveDate", "effectiveUntil", "yieldTaxRate", "profileId")
					.build(),
			);
			expect(written).toMatchObject({
				effectiveDate: "2026-03-01",
				effectiveUntil: "2026-03-31",
				profileId: null,
				yieldTaxRate: null,
			});
			const policies = await getFinancialInstitutionYieldPolicies(["date-policy-institution"]);
			const policy = policies.get("date-policy-institution")?.[0];
			expect(policy?.effectiveDate.toISOString()).toBe("2026-03-01T00:00:00.000Z");
			expect(
				policy?.effectiveUntil == null ? null : new Date(policy.effectiveUntil).toISOString(),
			).toBe("2026-03-31T00:00:00.000Z");
			expect(policy?.yieldTaxRate).toBeNull();
			const [cleared] = await queryRows(
				db.sql.public.FinancialInstitutionYieldPolicy.update({ effectiveUntil: null })
					.where((f, fn) => fn.eq(f.id, id))
					.returning("effectiveUntil")
					.build(),
			);
			expect(cleared?.effectiveUntil).toBeNull();
			const clearedPolicies = await getFinancialInstitutionYieldPolicies(["date-policy-institution"]);
			expect(clearedPolicies.get("date-policy-institution")?.[0]?.effectiveUntil).toBeNull();
			await queryRows(
				db.sql.public.FinancialInstitutionYieldPolicy.delete()
					.where((f, fn) => fn.eq(f.id, id))
					.returning("id")
					.build(),
			);
		}
	} finally {
		if (previousTimezone === undefined) delete process.env.TZ;
		else process.env.TZ = previousTimezone;
	}
});
