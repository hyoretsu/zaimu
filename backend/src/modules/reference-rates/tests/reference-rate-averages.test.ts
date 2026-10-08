import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { referenceRateAveragesSql } from "../domain/reference-rate-averages-sql";

const url = requireFixtureUrl("REFERENCE_RATES_TEST_URL");
let client: Client;
beforeAll(async () => {
	client = new Client({ connectionString: url });
	await client.connect();
	await client.query(`CREATE TABLE "ReferenceRate" ("type" text, "date" date, "value" numeric);
 CREATE TABLE "OutboxEvent" ("eventType" text, "payload" jsonb);
 INSERT INTO "ReferenceRate" VALUES ('CDI', '2016-10-02', 9), ('CDI', '2016-10-03', 0.02), ('CDI', '2026-10-02', 0.06), ('CDI', '2026-10-03', 8), ('SELIC', '2026-10-02', 0.03);
 INSERT INTO "OutboxEvent" VALUES ('referenceRate.historyFetched', '{"referenceType":"CDI","startDate":"2016-10-03","endDate":"2026-10-02"}');`);
});
afterAll(async () => {
	await client?.end();
});
describe("local reference-rate means", () => {
	test("SQL averages published days only, excludes dates outside ten-year window, and requires full coverage", async () => {
		const rows = (await client.query(referenceRateAveragesSql, ["2016-10-03", "2026-10-02"])).rows;
		expect(Number(rows.find(row => row.type === "CDI").average)).toBeCloseTo(0.04);
		expect(rows.find(row => row.type === "CDI").ready).toBe(true);
		expect(rows.find(row => row.type === "SELIC").ready).toBe(false);
		await client.query(
			`INSERT INTO "OutboxEvent" VALUES ('referenceRate.historyFetched', '{"referenceType":"SELIC","startDate":"2016-10-03","endDate":"2026-10-01"}');`,
		);
		const incomplete = (await client.query(referenceRateAveragesSql, ["2016-10-03", "2026-10-02"])).rows;
		expect(incomplete.find(row => row.type === "SELIC").ready).toBe(false);
		await client.query(
			`INSERT INTO "OutboxEvent" VALUES ('referenceRate.historyFetched', '{"referenceType":"SELIC","startDate":"2026-10-02","endDate":"2026-10-02"}');`,
		);
		const complete = (await client.query(referenceRateAveragesSql, ["2016-10-03", "2026-10-02"])).rows;
		expect(complete.find(row => row.type === "SELIC").ready).toBe(true);
	});
});
