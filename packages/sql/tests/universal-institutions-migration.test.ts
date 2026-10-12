import { expect, test } from "bun:test";
import { readFileSync } from "node:fs";
import operations from "../migrations/app/20261012T1345_universal_institutions_financial_coverage/ops.json";
import contract from "../migrations/snapshots/a92b1f7f1f3a857567384af7b56de1a1e8aec7e149dd069ab662f5b4e1263ac0/contract.json";

const tables = contract.storage.namespaces.public.entries.table;
const backfill = readFileSync(
	new URL(
		"../migrations/app/20261012T1345_universal_institutions_financial_coverage/backfill.sql",
		import.meta.url,
	),
	"utf8",
);

test("universal institutions retain private ownership and independent account countries", () => {
	expect(tables.FinancialInstitution.columns.userId.nullable).toBe(true);
	expect(tables.FinancialInstitution.columns.status).toBeDefined();
	expect(tables.FinancialAccount.columns.countryCode.nullable).toBe(true);
	expect(tables.user.columns.preferredCountry.nullable).toBe(true);
	expect(tables.YieldCalendarCountry.columns).not.toHaveProperty("name");
});

test("migration preserves all existing financial history and calendars", () => {
	const deleted = operations.filter(operation => operation.id.startsWith("drop"));
	expect(deleted.map(operation => operation.id)).toEqual([
		"dropIndex.FinancialInstitutionYieldPolicy.FinancialInstitutionYieldPolicy_institutionId_effectiveDate_key",
		"dropColumn.YieldCalendarCountry.name",
	]);
	expect(backfill).toContain("HAVING count(*) = 1");
	expect(backfill).toContain("'MANUAL_PENDING', 'ADMIN', 'legacy'");
	expect(backfill).toContain("'INCLUDE' FROM \"YieldCalendarHoliday\"");
	expect(backfill).not.toMatch(/DELETE\s+FROM|TRUNCATE|UPDATE\s+"FinancialAccountYield"/i);
	expect(backfill).not.toContain('SET "globalRulesFrom"');
});

test("coverage has a country/year primary key and temporal policies support independent scopes", () => {
	expect(tables.YieldCalendarCoverage.primaryKey.columns).toEqual(["countryCode", "year"]);
	for (const column of ["profileId", "countryCode", "effectiveUntil", "status"]) {
		expect(tables.FinancialInstitutionYieldPolicy.columns).toHaveProperty(column);
	}
	expect(tables.UserInstitutionProfileChange.columns.effectiveDate).toBeDefined();
});
