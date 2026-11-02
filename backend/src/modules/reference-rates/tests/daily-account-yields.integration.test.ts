import { afterAll, afterEach, beforeAll, beforeEach, describe, expect, setSystemTime, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase, getQueryMetrics, queryRaw, withQueryMetrics } from "sql";
import { loadFinancialAccountBalanceInput } from "~/modules/accounts/application/get-financial-account-balances";
import { recalculateHistoricalAccountYields } from "~/modules/accounts/application/recalculate-historical-account-yields";
import type { EventEnvelope } from "~/shared/application/events";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { enqueueDailyAccountYieldRecalculations } from "../application/daily-account-yield-jobs";
import {
	enqueueDailyReferenceRateFetches,
	handleAccountYieldRecalculationCommand,
	handleReferenceRateFetchCommand,
	loadYieldAccounts,
} from "../application/reference-rate-jobs";

const morning = new Date("2026-10-16T09:00:00Z");
async function commands(type: string) {
	return queryRaw<EventEnvelope & Record<string, unknown>>(
		`SELECT "id" AS "eventId", "eventType", "payload" FROM "OutboxEvent" WHERE "eventType"=$1 ORDER BY "occurredAt","id"`,
		[type],
	);
}
async function replay(now = morning) {
	await enqueueDailyAccountYieldRecalculations(now);
	for (const event of await commands("command.account-yield-recalculation"))
		await handleAccountYieldRecalculationCommand(event);
}
async function seed(id: string, fixed = false) {
	await queryRaw(
		`INSERT INTO "FinancialAccount" ("id","userId","type","currency","countryCode","createdAt","yieldReferenceType","yieldReferencePercentage","yieldFixedRate","yieldPeriod") VALUES ($1,'owner','CHECKING','BRL','BR','2026-10-01',$2,$3,$4,$5)`,
		[id, fixed ? null : "CDI", fixed ? null : 105, fixed ? 1 : null, fixed ? "MONTHLY" : null],
	);
	await queryRaw(
		`INSERT INTO "Transaction" ("id","userId","type","amount","currency","date","description","destinationFinancialAccountId") VALUES ($1,'owner','INCOME',1000,'BRL','2026-10-02','Deposit',$2)`,
		[`${id}-deposit`, id],
	);
}
async function yields(id = "account") {
	return queryRaw<{
		id: string;
		date: string;
		amount: number;
		origin: string;
		kind: string;
		isExcluded: boolean;
	}>(
		`SELECT "id","date"::text,"amount","origin","kind","isExcluded" FROM "FinancialAccountYield" WHERE "financialAccountId"=$1 ORDER BY "date"`,
		[id],
	);
}
beforeAll(async () => {
	const client = new Client({ connectionString: requireFixtureUrl("DATABASE_TEST_URL") });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
});
afterAll(() => closeDatabase());
afterEach(() => setSystemTime());
beforeEach(async () => {
	await queryRaw(`TRUNCATE "user", "ReferenceRate", "OutboxEvent" CASCADE`);
	await queryRaw(
		`INSERT INTO "user" ("id","email","name","role") VALUES ('owner','yield@test.invalid','Owner','USER')`,
	);
});

describe("daily yield recovery", () => {
	test("late publication bypasses previously covered empty response and compounds 105% CDI", async () => {
		await seed("account");
		await enqueueDailyReferenceRateFetches(morning);
		await enqueueDailyReferenceRateFetches(new Date("2026-10-16T09:59:00Z"));
		expect(await commands("command.reference-rate-fetch")).toHaveLength(4);
		const first = (await commands("command.reference-rate-fetch")).find(
			e => (e.payload as { referenceType: string }).referenceType === "CDI",
		)!;
		let downloads = 0;
		await handleReferenceRateFetchCommand(first, async () => {
			downloads++;
			return [];
		});
		await replay();
		expect(await yields()).toHaveLength(0);
		await enqueueDailyReferenceRateFetches(new Date("2026-10-16T10:00:00Z"));
		expect(await commands("command.reference-rate-fetch")).toHaveLength(8);
		const next = (await commands("command.reference-rate-fetch")).find(
			e => (e.payload as { deduplicationKey: string }).deduplicationKey === "recent:CDI:2026-10-16:7",
		)!;
		await handleReferenceRateFetchCommand(next, async () => {
			downloads++;
			return ["2026-10-05", "2026-10-06"].map(day => ({
				date: new Date(`${day}T12:00:00`),
				value: 0.05,
			}));
		});
		for (const event of await commands("command.account-yield-recalculation"))
			await handleAccountYieldRecalculationCommand(event);
		const saved = await yields();
		expect(downloads).toBe(2);
		expect(saved.map(row => row.date)).toEqual(["2026-10-05", "2026-10-06"]);
		expect(saved[0]!.amount).toBeCloseTo(0.525, 4);
		expect(saved[1]!.amount).toBeCloseTo(0.5253, 4);
		await handleReferenceRateFetchCommand(next, async () => []);
		expect(await queryRaw(`SELECT * FROM "ReferenceRate"`)).toHaveLength(2);
	});
	test("restart fills older gaps using stored rates and preserves all user overrides", async () => {
		await seed("account");
		await queryRaw(
			`INSERT INTO "ReferenceRate" ("type","date","value") SELECT 'CDI', day, 0.05 FROM generate_series('2026-10-02'::date,'2026-10-16'::date,interval '1 day') day`,
		);
		await queryRaw(`INSERT INTO "FinancialAccountYield" ("id","financialAccountId","date","amount","kind","origin","isExcluded") VALUES
		 ('manual','account','2026-10-06',2,'MANUAL','USER',false),
		 ('edited','account','2026-10-07',3,'AUTOMATIC','USER',false),
		 ('excluded','account','2026-10-08',0,'AUTOMATIC','USER',true),
		 ('imported','account','2026-10-09',4,'MANUAL','USER',false),
		 ('today','account','2026-10-16',5,'AUTOMATIC','SYSTEM',false)`);
		const protectedRows = (await yields()).filter(row => row.origin === "USER" || row.id === "today");
		await replay();
		await enqueueDailyAccountYieldRecalculations(new Date("2026-10-16T10:00:00Z"));
		expect(await commands("command.account-yield-recalculation")).toHaveLength(1);
		const first = await yields();
		expect(first.filter(row => row.origin === "USER" || row.id === "today")).toEqual(protectedRows);
		expect(first.filter(row => row.origin === "SYSTEM").map(row => row.date)).toEqual([
			"2026-10-05",
			"2026-10-13",
			"2026-10-14",
			"2026-10-15",
			"2026-10-16",
		]);
		await queryRaw(`DELETE FROM "FinancialAccountYield" WHERE "id"='today'`);
		await replay(new Date("2026-11-20T09:00:00Z"));
		const recovered = await yields();
		expect(recovered.find(row => row.date === "2026-10-05")!.amount).toBe(first[0]!.amount);
		expect(recovered.filter(row => row.origin === "USER")).toEqual(
			protectedRows.filter(row => row.origin === "USER"),
		);
		expect(recovered.find(row => row.date === "2026-10-16")).toBeDefined();
	});

	test("fixed and institutional yields need no new rate; calendar excludes holidays and same-day deposit", async () => {
		await seed("fixed", true);
		await seed("institutional", true);
		await queryRaw(`INSERT INTO "FinancialInstitution" ("id","name","normalizedName","status") VALUES ('bank','Bank','bank','APPROVED');
		 INSERT INTO "FinancialInstitutionYieldPolicy" ("id","financialInstitutionId","currency","countryCode","effectiveDate","yieldPeriod") VALUES ('policy','bank','BRL','BR','2026-10-01','MONTHLY');
		 INSERT INTO "FinancialInstitutionYieldRule" ("id","financialYieldPolicyId","yieldFixedRate","position") VALUES ('rule','policy',1,0);
		 UPDATE "FinancialAccount" SET "institutionId"='bank',"yieldFixedRate"=NULL,"yieldPeriod"=NULL WHERE "id"='institutional'`);
		await replay();
		const fixed = await yields("fixed");
		expect(fixed.map(row => row.date)).toEqual([
			"2026-10-05",
			"2026-10-06",
			"2026-10-07",
			"2026-10-08",
			"2026-10-09",
			"2026-10-13",
			"2026-10-14",
			"2026-10-15",
		]);
		expect((await yields("institutional")).map(row => row.amount)).toEqual(fixed.map(row => row.amount));
		const event = (await commands("command.account-yield-recalculation")).find(
			e => (e.payload as { financialAccountId: string }).financialAccountId === "fixed",
		)!;
		await Promise.all([
			handleAccountYieldRecalculationCommand(event),
			handleAccountYieldRecalculationCommand(event),
		]);
		expect((await yields("fixed")).map(row => row.amount)).toEqual(fixed.map(row => row.amount));
	});

	test("bulk yield context reuses replay inputs without reloading account policies and histories", async () => {
		await seed("context-first");
		await seed("context-second");
		await queryRaw(
			`INSERT INTO "FinancialAccountYieldRateHistory" ("id","financialAccountId","effectiveDate","yieldReferenceType","yieldReferencePercentage") VALUES ('context-history','context-first','2026-10-10','CDI',110)`,
		);
		const ids = ["context-first", "context-second"];
		// Prepare calendar rows before comparing stable query work.
		await loadFinancialAccountBalanceInput(ids);
		const baseline = await withQueryMetrics(async () => {
			const loaded = await loadFinancialAccountBalanceInput(ids);
			return { input: loaded.input!, queries: getQueryMetrics()!.queryCount };
		});
		await withQueryMetrics(async () => {
			const accounts = await loadYieldAccounts(ids);
			// The tax catalog is the only query added to the replay input loader.
			expect(getQueryMetrics()!.queryCount).toBe(baseline.queries + 1);
			expect(accounts.map(({ yieldLots: _, ...account }) => account)).toEqual(baseline.input.accounts);
			expect(accounts).toHaveLength(2);
			for (const account of accounts) {
				expect(account.countryCode).toBe("BR");
				expect(account.yieldLots).toEqual([{ balance: 1000, date: "2026-10-02" }]);
			}
			const histories = accounts.find(account => account.id === "context-first")!.yieldRateHistories!;
			expect(histories).toHaveLength(1);
			expect(histories[0]!.yieldReferenceType).toBe("CDI");
			expect(Number(histories[0]!.yieldReferencePercentage)).toBe(110);
			expect(histories[0]!.effectiveDate.toISOString().slice(0, 10)).toBe("2026-10-10");
		});
		await withQueryMetrics(async () => {
			expect(await loadYieldAccounts([])).toEqual([]);
			expect(getQueryMetrics()!.queryCount).toBe(0);
		});
	});

	test("missing country leaves work pending until subsequent recovery", async () => {
		await seed("account", true);
		await queryRaw(`UPDATE "FinancialAccount" SET "countryCode"=NULL WHERE "id"='account'`);
		await replay();
		expect(await yields()).toHaveLength(0);
		await queryRaw(`UPDATE "FinancialAccount" SET "countryCode"='BR' WHERE "id"='account'`);
		await replay(new Date("2026-10-17T09:00:00Z"));
		expect((await yields()).length).toBeGreaterThan(0);
	});
});

describe("historical yield recalculation", () => {
	test("rebuilds automatic yields for an account created after its transactions", async () => {
		setSystemTime(new Date("2026-11-02T14:00:00Z"));
		await queryRaw(
			`INSERT INTO "FinancialAccount" ("id","userId","type","currency","countryCode","createdAt") VALUES ('hist','owner','SAVINGS','BRL','BR','2026-09-13T15:00:00Z')`,
		);
		await queryRaw(
			`INSERT INTO "Transaction" ("id","userId","type","amount","currency","date","description","destinationFinancialAccountId") VALUES ('hist-deposit','owner','INCOME',100,'BRL','2026-04-26','Deposit','hist')`,
		);
		await queryRaw(
			`INSERT INTO "ReferenceRate" ("id","type","date","value") SELECT 'cdi-'||d::date, 'CDI', d::date, 0.05 FROM generate_series('2026-04-01'::date,'2026-10-30'::date,'1 day') d`,
		);
		await recalculateHistoricalAccountYields("owner", "hist", undefined, {
			yieldReferencePercentage: 100,
			yieldReferenceType: "CDI",
		});
		for (const event of await commands("command.account-yield-recalculation"))
			await handleAccountYieldRecalculationCommand(event);
		const automatic = (await yields("hist")).filter(row => row.origin === "SYSTEM");
		// The account row is newer than its first movement: history must start at the deposit.
		expect(automatic[0]!.date).toBe("2026-04-27");
		expect(automatic.at(-1)!.date).toBe("2026-10-30");
	});
});
