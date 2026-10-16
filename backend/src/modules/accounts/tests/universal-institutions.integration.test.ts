import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase, queryRaw } from "sql";
import contract from "../../../../../packages/sql/migrations/snapshots/0567ee71a30f4562462e07ff2776133815a39ed36b3807bdeafbfa0e1527e22e/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { ensureAccountCoverage, ensureCalendarCoverage } from "../../yield-calendar/ensure-coverage";
import {
	consolidateLegacyInstitution,
	listInstitutionCatalog,
} from "../application/consolidate-legacy-institution";
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
		expect(await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"='private-account'`)).toHaveLength(
			1,
		);
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
		await expect(reviewInstitutionProposal("admin", two.id, "APPROVE")).rejects.toThrow("Versão alterada");
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
		expect((await listInstitutionCatalog("admin", true)).some(item => sources.includes(item.id))).toBe(false);
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
			await queryRaw(`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1`, [
				result.institutionId,
			]),
		).toHaveLength(0);
		expect(
			await queryRaw(`SELECT "id" FROM "FinancialInstitutionYieldPolicy" WHERE "financialInstitutionId"=$1`, [
				id,
			]),
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
});
