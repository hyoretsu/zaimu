import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import {
	cardRuleValues,
	defaultCardRules,
	type InstitutionCardRules,
} from "@zaimu/finance/institution-card-rules";
import { Client } from "pg";
import { closeDatabase, queryRaw } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { getFinancialCoverage } from "../../financial-history/application/financial-coverage";
import { ensureAccountCoverage, ensureCalendarCoverage } from "../../yield-calendar/ensure-coverage";
import {
	consolidateLegacyInstitution,
	listInstitutionCatalog,
} from "../application/consolidate-legacy-institution";
import { cardRuleValuesSql } from "../application/institution-card-rules";
import {
	ensureInstitutionLink,
	proposeInstitution,
	reviewInstitutionProposal,
	visibleInstitution,
} from "../application/universal-institutions";

const url = requireFixtureUrl("DATABASE_TEST_URL");
describe("universal institution review and calendar coverage", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
		} finally {
			await client.end();
		}
		await queryRaw(
			`INSERT INTO "user" ("id","email","name","role") VALUES ('owner','owner@test.invalid','Owner','USER'),('other','other@test.invalid','Other','USER'),('admin','admin@test.invalid','Admin','ADMIN')`,
		);
	});
	afterAll(() => closeDatabase());
	test("new profiles require approval and preserve the standard profile", async () => {
		const institution = await proposeInstitution("admin", null, "NEW_INSTITUTION", {
			name: "Profile bank",
		});
		const proposal = await proposeInstitution("admin", institution.institutionId, "PROFILE", {
			name: "  Premium  ",
		});
		expect(proposal.status).toBe("PENDING");
		expect(
			await queryRaw(
				`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1 AND "name"='Premium'`,
				[institution.institutionId],
			),
		).toHaveLength(0);
		await reviewInstitutionProposal("admin", proposal.id, "APPROVE");
		const profiles = await queryRaw(
			`SELECT * FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1`,
			[institution.institutionId],
		);
		expect(profiles.find(profile => profile.isDefault)?.name).toBe("Padrão");
		expect(profiles.find(profile => profile.name === "Premium")?.isDefault).toBe(false);
		const duplicate = await proposeInstitution("admin", institution.institutionId, "PROFILE", {
			name: "premium",
		});
		await expect(reviewInstitutionProposal("admin", duplicate.id, "APPROVE")).rejects.toThrow(
			"Já existe",
		);
	});
	test("new policies publish without currency and keep legacy scope intact", async () => {
		const institution = await proposeInstitution("admin", null, "NEW_INSTITUTION", {
			name: "Universal policy bank",
			operatingCountryCodes: ["BR"],
		});
		const [profile] = await queryRaw(
			`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1 AND "isDefault"`,
			[institution.institutionId],
		);
		const legacy = await proposeInstitution(
			"admin",
			institution.institutionId,
			"POLICY",
			{
				countryCode: "BR",
				currency: "BRL",
				profileId: profile!.id,
				rules: [{ yieldFixedRate: 1 }],
				yieldPeriod: "MONTHLY",
			},
			"2026-01-01",
		);
		await reviewInstitutionProposal("admin", legacy.id, "APPROVE");
		for (const rate of [2, 3]) {
			const next = await proposeInstitution(
				"admin",
				institution.institutionId,
				"POLICY",
				{
					countryCode: "BR",
					profileId: profile!.id,
					rules: [{ yieldFixedRate: rate }],
					yieldPeriod: "MONTHLY",
				},
				"2026-02-01",
			);
			await reviewInstitutionProposal("admin", next.id, "APPROVE");
		}
		const policies = await queryRaw(
			`SELECT "currency", "effectiveDate" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1 ORDER BY "effectiveDate"`,
			[institution.institutionId],
		);
		expect(policies.map(policy => policy.currency)).toEqual(["BRL", null]);
		await queryRaw(
			`INSERT INTO "FinancialAccount" ("id","userId","type","institutionId","countryCode","currency") VALUES ('policy-brl','owner','CHECKING',$1,'BR','BRL'),('policy-usd','owner','CHECKING',$1,'BR','USD')`,
			[institution.institutionId],
		);
		const inventory = await getFinancialCoverage("owner", false, "2026-02-01", "2026-02-28");
		const universal = inventory.items.find(
			item =>
				item.kind === "POLICY" &&
				item.institutionId === institution.institutionId &&
				item.currency === null,
		);
		expect(universal?.affectedAccountIds.toSorted()).toEqual(["policy-brl", "policy-usd"]);
		expect(inventory.items.some(item => item.id === "policy:policy-usd")).toBe(false);
	});
	test("admin creation publishes immediately with review audit and no pending notification", async () => {
		const created = await proposeInstitution("admin", null, "NEW_INSTITUTION", {
			creditStatementClosingInclusive: true,
			currency: "BRL",
			name: "Admin bank",
		});
		expect(created.status).toBe("APPROVED");
		const institution = await visibleInstitution("other", created.institutionId);
		expect(institution.status).toBe("APPROVED");
		expect(institution.creditStatementClosingInclusive).toBe(true);
		const [proposal] = await queryRaw(`SELECT * FROM "FinancialInstitutionProposal" WHERE "id"=$1`, [
			created.id,
		]);
		expect(proposal.status).toBe("APPROVED");
		expect(proposal.reviewerId).toBe("admin");
		expect(
			await queryRaw(
				`SELECT * FROM "InstitutionReviewAudit" WHERE "proposalId"=$1 AND "action"='APPROVE'`,
				[created.id],
			),
		).toHaveLength(1);
		expect(
			await queryRaw(
				`SELECT * FROM "AppNotification" WHERE "type"='INSTITUTION_REVIEW' AND "payload"->>'proposalId'=$1`,
				[created.id],
			),
		).toHaveLength(0);
	});
	test("institution links bind user IDs consistently and remain private and idempotent", async () => {
		const draft = await proposeInstitution("owner", null, "NEW_INSTITUTION", {
			currency: "BRL",
			name: "Card creation bank",
		});
		const date = new Date("2026-10-16T12:00:00Z");
		await ensureInstitutionLink("other", draft.institutionId!, date);
		await ensureInstitutionLink("owner", draft.institutionId!, date);
		await ensureInstitutionLink("owner", draft.institutionId!, date);
		const links = await queryRaw<{ userId: string; globalRulesFrom: Date | null }>(
			`SELECT "userId","globalRulesFrom" FROM "UserFinancialInstitution" WHERE "institutionId"=$1`,
			[draft.institutionId],
		);
		expect(links).toEqual([{ globalRulesFrom: null, userId: "owner" }]);
	});
	test("pending and rejected institutions remain private; account survives rejection", async () => {
		const draft = await proposeInstitution("owner", null, "NEW_INSTITUTION", {
			currency: "USD",
			name: "Private Inter",
		});
		expect((await visibleInstitution("owner", draft.institutionId)).status).toBe("PENDING");
		await expect(visibleInstitution("other", draft.institutionId)).rejects.toThrow();
		await queryRaw(
			`INSERT INTO "FinancialAccount" ("id","userId","type","institutionId","currency") VALUES ('private-account','owner','CHECKING',$1,'USD')`,
			[draft.institutionId],
		);
		await reviewInstitutionProposal("admin", draft.id, "REJECT", "Identity could not be verified");
		expect(
			await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"='private-account'`),
		).toHaveLength(1);
		await expect(visibleInstitution("other", draft.institutionId)).rejects.toThrow();
		expect(
			(await queryRaw(`SELECT "id" FROM "AppNotification" WHERE "userId"='owner'`)).length,
		).toBeGreaterThan(0);
	});
	test("homonyms remain separate and concurrent reviewers publish once", async () => {
		const first = await proposeInstitution("owner", null, "NEW_INSTITUTION", {
			currency: "BRL",
			name: "Inter",
		});
		const second = await proposeInstitution("other", null, "NEW_INSTITUTION", {
			currency: "USD",
			name: "Inter",
		});
		expect(first.institutionId).not.toBe(second.institutionId);
		const results = await Promise.allSettled([
			reviewInstitutionProposal("admin", first.id, "APPROVE"),
			reviewInstitutionProposal("admin", first.id, "APPROVE"),
		]);
		expect(results.filter(result => result.status === "fulfilled")).toHaveLength(1);
		expect((await visibleInstitution("other", first.institutionId)).status).toBe("APPROVED");
		expect(
			await queryRaw(`SELECT "id" FROM "InstitutionReviewAudit" WHERE "proposalId"=$1`, [first.id]),
		).toHaveLength(1);
		await expect(visibleInstitution("owner", second.institutionId)).rejects.toThrow();
	});
	test("stale proposal requires explicit current version confirmation", async () => {
		const draft = await proposeInstitution("owner", null, "NEW_INSTITUTION", {
			currency: "USD",
			name: "Review Bank",
		});
		await reviewInstitutionProposal("admin", draft.id, "APPROVE");
		const one = await proposeInstitution("owner", draft.institutionId, "INSTITUTION_UPDATE", {
			name: "Review Bank A",
		});
		const two = await proposeInstitution("other", draft.institutionId, "INSTITUTION_UPDATE", {
			name: "Review Bank B",
		});
		await reviewInstitutionProposal("admin", one.id, "APPROVE");
		await expect(reviewInstitutionProposal("admin", two.id, "APPROVE")).rejects.toThrow(
			"Versão alterada",
		);
		const current = await visibleInstitution("owner", draft.institutionId);
		await reviewInstitutionProposal("admin", two.id, "APPROVE", undefined, undefined, current.version);
		expect((await visibleInstitution("owner", draft.institutionId)).name).toBe("Review Bank B");
	});
	test("merge requires explicit profile resolution and preserves private account source", async () => {
		const source = await proposeInstitution("owner", null, "NEW_INSTITUTION", {
			currency: "USD",
			name: "Merge Source",
		});
		const target = await proposeInstitution("other", null, "NEW_INSTITUTION", {
			currency: "USD",
			name: "Merge Target",
		});
		await reviewInstitutionProposal("admin", target.id, "APPROVE");
		const [profile] = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1 AND "isDefault"`,
			[source.institutionId],
		);
		await queryRaw(
			`INSERT INTO "UserFinancialInstitution" ("id","userId","institutionId") VALUES ('source-link','owner',$1)`,
			[source.institutionId],
		);
		await queryRaw(
			`INSERT INTO "UserInstitutionProfileChange" ("id","linkId","profileId","effectiveDate") VALUES ('source-change','source-link',$1,'2026-03-01')`,
			[profile.id],
		);
		await queryRaw(
			`INSERT INTO "FinancialAccount" ("id","userId","type","institutionId","currency") VALUES ('merge-account','owner','CHECKING',$1,'USD')`,
			[source.institutionId],
		);
		const proposal = await proposeInstitution("owner", source.institutionId, "MERGE", {
			targetId: target.institutionId,
		});
		await expect(
			reviewInstitutionProposal("admin", proposal.id, "ASSOCIATE", undefined, target.institutionId),
		).rejects.toThrow("histórico de perfis");
		await reviewInstitutionProposal(
			"admin",
			proposal.id,
			"ASSOCIATE",
			undefined,
			target.institutionId,
			undefined,
			[],
		);
		const [account] = await queryRaw<{ institutionId: string; legacyInstitutionId: string }>(
			`SELECT "institutionId","legacyInstitutionId" FROM "FinancialAccount" WHERE "id"='merge-account'`,
		);
		expect(account.institutionId).toBe(target.institutionId);
		expect(account.legacyInstitutionId).toBe(source.institutionId);
		expect(
			await queryRaw(`SELECT "id" FROM "UserInstitutionProfileChange" WHERE "id"='source-change'`),
		).toHaveLength(1);
	});

	test("legacy identities become one global catalog entry while private history stays archived", async () => {
		const sources: string[] = [];
		for (const owner of ["owner", "other"]) {
			const id = crypto.randomUUID();
			await queryRaw(
				`INSERT INTO "FinancialInstitution" ("id","userId","name","normalizedName","currency","status") VALUES ($1,$2,'Shared Legacy Bank','shared legacy bank','USD','LEGACY_PRIVATE')`,
				[id, owner],
			);
			await queryRaw(
				`INSERT INTO "FinancialAccount" ("id","userId","type","institutionId","currency") VALUES ($1,$2,'CHECKING',$3,'USD')`,
				[`legacy-${owner}`, owner, id],
			);
			sources.push(id);
		}
		const first = await consolidateLegacyInstitution("admin", sources[0]!);
		await expect(consolidateLegacyInstitution("admin", sources[1]!)).rejects.toThrow("Já existe");
		const second = await consolidateLegacyInstitution("admin", sources[1]!, first.institutionId);
		expect(second.institutionId).toBe(first.institutionId);
		for (const owner of ["owner", "other"]) {
			const catalog = await listInstitutionCatalog(owner);
			expect(catalog.filter(item => item.name === "Shared Legacy Bank").map(item => item.id)).toEqual([
				first.institutionId,
			]);
			const [account] = await queryRaw<{ institutionId: string; legacyInstitutionId: string }>(
				`SELECT "institutionId","legacyInstitutionId" FROM "FinancialAccount" WHERE "id"=$1`,
				[`legacy-${owner}`],
			);
			expect(account.institutionId).toBe(first.institutionId);
			expect(sources).toContain(account.legacyInstitutionId);
		}
		expect((await listInstitutionCatalog("admin", true)).some(item => sources.includes(item.id))).toBe(
			false,
		);
		expect(
			await queryRaw(
				`SELECT "id" FROM "InstitutionReviewAudit" WHERE "proposalId" IN (SELECT "id" FROM "FinancialInstitutionProposal" WHERE "institutionId"=ANY($1::text[]))`,
				[sources],
			),
		).toHaveLength(2);
		await expect(consolidateLegacyInstitution("admin", sources[0]!)).rejects.toThrow();
	});
	test("publishing a legacy link without accounts preserves its private policies", async () => {
		const id = crypto.randomUUID();
		await queryRaw(
			`INSERT INTO "FinancialInstitution" ("id","userId","name","normalizedName","currency","status") VALUES ($1,'owner','Empty Legacy Bank','empty legacy bank','USD','LEGACY_PRIVATE')`,
			[id],
		);
		await queryRaw(
			`INSERT INTO "FinancialInstitutionYieldPolicy" ("id","financialInstitutionId","currency","effectiveDate") VALUES ('legacy-private-policy',$1,'USD','2026-01-01')`,
			[id],
		);
		const profileId = crypto.randomUUID();
		await queryRaw(
			`INSERT INTO "FinancialInstitutionProfile" ("id","institutionId","name","isDefault") VALUES ($1,$2,'Padrão',true)`,
			[profileId, id],
		);
		const pending = await proposeInstitution(
			"owner",
			id,
			"POLICY",
			{ currency: "USD", profileId, rules: [] },
			"2026-04-01",
		);
		const result = await consolidateLegacyInstitution("admin", id);
		const [movedProposal] = await queryRaw(
			`SELECT "institutionId","status","payload" FROM "FinancialInstitutionProposal" WHERE "id"=$1`,
			[pending.id],
		);
		expect(movedProposal.institutionId).toBe(result.institutionId);
		expect(movedProposal.status).toBe("PENDING");
		const [targetProfile] = await queryRaw<{ id: string }>(
			`SELECT "id" FROM "FinancialInstitutionProfile" WHERE "institutionId"=$1 AND "isDefault"`,
			[result.institutionId],
		);
		expect((movedProposal.payload as { profileId: string }).profileId).toBe(targetProfile.id);
		expect((await visibleInstitution("other", result.institutionId)).status).toBe("APPROVED");
		expect(
			await queryRaw(
				`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1`,
				[result.institutionId],
			),
		).toHaveLength(0);
		expect(
			await queryRaw(
				`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1`,
				[id],
			),
		).toHaveLength(1);
		expect(
			await queryRaw(
				`SELECT "id" FROM "UserFinancialInstitution" WHERE "institutionId"=$1 AND "userId"='owner' AND "globalRulesFrom" IS NULL`,
				[result.institutionId],
			),
		).toHaveLength(1);
	});
	test("concurrent generation is idempotent and preserves administrative exclusions", async () => {
		await Promise.all([
			ensureAccountCoverage("BRL", "BR", [2026]),
			ensureAccountCoverage("BRL", "BR", [2026]),
		]);
		const [before] = await queryRaw<{ count: number }>(
			`SELECT count(*)::int AS count FROM "CurrencyCountryAssociation" WHERE "currency"='BRL'`,
		);
		await ensureAccountCoverage("BRL", "BR", [2026]);
		const [after] = await queryRaw<{ count: number }>(
			`SELECT count(*)::int AS count FROM "CurrencyCountryAssociation" WHERE "currency"='BRL'`,
		);
		expect(after.count).toBe(before.count);
		await queryRaw(
			`INSERT INTO "YieldCalendarOverride" ("id","countryCode","date","action") VALUES ('exclude','BR','2026-04-03','EXCLUDE')`,
		);
		await queryRaw(`DELETE FROM "YieldCalendarHoliday" WHERE "countryCode"='BR' AND "date"='2026-04-03'`);
		await queryRaw(
			`UPDATE "YieldCalendarCoverage" SET "sourceVersion"='old' WHERE "countryCode"='BR' AND "year"=2026`,
		);
		await ensureCalendarCoverage("BR", 2026);
		expect(
			await queryRaw(
				`SELECT "id" FROM "YieldCalendarHoliday" WHERE "countryCode"='BR' AND "date"='2026-04-03'`,
			),
		).toHaveLength(0);
		expect(await ensureCalendarCoverage("AQ", 2026)).toBe("UNAVAILABLE");
		expect(await ensureAccountCoverage("USD", null, [2026])).toBe(false);
	});
	test("materialized card rule projection preserves archived history, nulls and numeric values", async () => {
		const rules = (rate: number): InstitutionCardRules => ({
			cashback: {
				conversionAmount: null,
				conversionPoints: null,
				kind: "CASHBACK",
				rate,
				yieldPeriod: "MONTHLY",
				yieldReferencePercentage: 110,
				yieldReferenceRate: 12.5,
			},
			workingDueDate: true,
		});
		const oldRules = rules(1.25);
		const currentRules = rules(2.5);
		const profiles = [
			{ creditCardRules: oldRules, id: "old" },
			{ creditCardRules: currentRules, id: "current" },
		];
		const cases = [
			{ context: null, expected: defaultCardRules, id: "none" },
			{ context: {}, expected: defaultCardRules, id: "empty" },
			{
				context: { cardRulesProfiles: profiles, defaultInstitutionProfileId: "old" },
				expected: oldRules,
				id: "default",
			},
			{
				context: {
					cardRulesProfiles: profiles,
					defaultInstitutionProfileId: "old",
					institutionProfileChanges: [
						{ effectiveDate: "2000-01-01", profileId: "current" },
						{ effectiveDate: "2999-01-01", profileId: "old" },
					],
				},
				expected: currentRules,
				id: "history",
			},
			{
				context: {
					cardRulesProfiles: [{ creditCardRules: null, id: "old" }],
					defaultInstitutionProfileId: "old",
				},
				expected: defaultCardRules,
				id: "null-profile",
			},
			{
				context: {
					cardRulesProfiles: [
						{ creditCardRules: { cashback: null, workingDueDate: true }, id: "old" },
					],
					defaultInstitutionProfileId: "old",
				},
				expected: { cashback: null, workingDueDate: true },
				id: "no-cashback",
			},
			{
				context: {
					cardRulesProfiles: [{ creditCardRules: rules(0), id: "old" }],
					defaultInstitutionProfileId: "old",
				},
				expected: rules(0),
				id: "zero",
			},
		];
		const input = cases.map(row => ({
			id: row.id,
			institutionId: null,
			transferredProfileContext: row.context,
			userId: "owner",
		}));
		const rows = await queryRaw<{ id: string; values: ReturnType<typeof cardRuleValues> }>(
			`SELECT account.id, ${cardRuleValuesSql("account")} AS values FROM jsonb_to_recordset($1::jsonb) account(id text,"userId" text,"institutionId" text,"transferredProfileContext" jsonb)`,
			[JSON.stringify(input)],
		);
		expect(rows).toHaveLength(cases.length);
		const expected = new Map(cases.map(row => [row.id, cardRuleValues(row.expected)]));
		for (const row of rows) {
			const value = expected.get(row.id);
			if (!value) throw new Error("Unexpected projected account identity");
			expect(row.values).toEqual(value);
		}
	});
});
