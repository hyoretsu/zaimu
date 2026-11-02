import { afterAll, beforeAll, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase, getQueryMetrics, queryRaw, withQueryMetrics, withRawTransaction } from "sql";
import { distributedCache } from "~/shared/infra/cache";
import { writeNamespaces } from "~/shared/infra/elysia/data-consistency";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { defaultCurrency } from "../application/currency-defaults";
import { getStoredCurrencyFactors } from "../infra/currency-exchange";

const url = requireFixtureUrl("DATABASE_TEST_URL");
requireFixtureUrl("CACHE_TEST_REDIS_URL");
beforeAll(async () => {
	const client = new Client({ connectionString: url });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
	await queryRaw(
		`INSERT INTO "user" (id,email,name,"preferredCurrency") VALUES ('currency-owner','currency-owner@test.invalid','Owner','BRL'),('currency-other','currency-other@test.invalid','Other','EUR'),('currency-unset','currency-unset@test.invalid','Unset',NULL)`,
	);
	// Warm the runtime (per-connection DateStyle/lc_monetary startup settings and the one-time contract marker probe)
	// so query-count assertions measure only the default-currency read itself.
	await defaultCurrency("currency-warmup");
});
afterAll(() => closeDatabase());

test("cached default currency performs no SQL and keeps user preferences separate", async () => {
	await withQueryMetrics(async () => {
		expect(await defaultCurrency("currency-owner")).toBe("BRL");
		expect(getQueryMetrics()?.queryCount).toBe(1);
	});
	await withQueryMetrics(async () => {
		expect(await defaultCurrency("currency-owner")).toBe("BRL");
		expect(getQueryMetrics()?.queryCount).toBe(0);
	});
	expect(await defaultCurrency("currency-other")).toBe("EUR");
	expect(await defaultCurrency("currency-unset")).toBe("USD");
	await withQueryMetrics(async () => {
		expect(await defaultCurrency("currency-unset")).toBe("USD");
		expect(getQueryMetrics()?.queryCount).toBe(0);
	});
});

test("preference write fence bypasses old default and invalidates dashboard on commit", async () => {
	const userId = "currency-owner";
	const namespaces = writeNamespaces("/currency-preferences/");
	await distributedCache.remember(userId, "dashboard", {}, async () => "old-dashboard");
	const token = await distributedCache.beginWrite(userId, namespaces);
	try {
		await withRawTransaction(async () => {
			await queryRaw('UPDATE "user" SET "preferredCurrency"=$1 WHERE id=$2', ["EUR", userId]);
			expect(await defaultCurrency(userId)).toBe("EUR");
		});
	} finally {
		await distributedCache.finishWrite(userId, namespaces, token);
	}
	expect(await distributedCache.read(userId, "dashboard", {})).toBeUndefined();
	expect(await defaultCurrency(userId)).toBe("EUR");
	await withQueryMetrics(async () => {
		expect(await defaultCurrency(userId)).toBe("EUR");
		expect(getQueryMetrics()?.queryCount).toBe(0);
	});
});

test("rolled back preference never publishes uncommitted default", async () => {
	const userId = "currency-other";
	await defaultCurrency(userId);
	const namespaces = writeNamespaces("/currency-preferences/");
	const token = await distributedCache.beginWrite(userId, namespaces);
	try {
		await expect(
			withRawTransaction(async () => {
				await queryRaw('UPDATE "user" SET "preferredCurrency"=$1 WHERE id=$2', ["BRL", userId]);
				expect(await defaultCurrency(userId)).toBe("BRL");
				throw new Error("forced currency rollback");
			}),
		).rejects.toThrow("forced currency rollback");
	} finally {
		await distributedCache.finishWrite(userId, namespaces, token);
	}
	expect(await defaultCurrency(userId)).toBe("EUR");
});

test("historical batch reads once and observes destination removal", async () => {
	await queryRaw(
		`INSERT INTO "CurrencyRateSnapshot" ("date","baseCurrency","rates") VALUES ('2001-02-03','USD','{"BRL":5}'::jsonb),('2001-02-03','BRL','{"USD":0.2}'::jsonb)`,
	);
	const demands = Array.from({ length: 10000 }, () => ({ date: "2001-02-03", source: "USD" }));
	try {
		await withQueryMetrics(async () => {
			expect([...(await getStoredCurrencyFactors(demands, "BRL"))]).toEqual([["USD:2001-02-03", 5]]);
			expect(getQueryMetrics()?.queryCount).toBe(1);
		});
		await queryRaw(
			`DELETE FROM "CurrencyRateSnapshot" WHERE "date"='2001-02-03' AND "baseCurrency"='BRL'`,
		);
		await withQueryMetrics(async () => {
			expect((await getStoredCurrencyFactors(demands, "BRL")).size).toBe(0);
			expect(getQueryMetrics()?.queryCount).toBe(1);
		});
	} finally {
		await queryRaw(`DELETE FROM "CurrencyRateSnapshot" WHERE "date"='2001-02-03'`);
	}
});
