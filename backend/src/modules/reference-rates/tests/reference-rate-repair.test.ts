import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { referenceRateInsertSql } from "../domain/reference-rate-insert-sql";

const socket = process.env.REFERENCE_RATE_REPAIR_TEST_SOCKET;
let client: Client;
beforeAll(async () => {
	if (!socket) return;
	if (!socket.startsWith("/tmp/zaimu-reference-rate-repair-"))
		throw new Error("Use isolated local reference-rate repair socket");
	client = new Client({ database: "postgres", host: socket, port: 55440, user: process.env.USER });
	await client.connect();
	await client.query(`CREATE TABLE "ReferenceRate" (
 "id" serial PRIMARY KEY, "type" text, "date" date, "value" numeric,
 "updatedAt" timestamp DEFAULT now(), UNIQUE ("type", "date"))`);
});
afterAll(async () => {
	await client?.end();
});

describe.skipIf(!socket)("insert-only reference-rate repair", () => {
	test("preserves existing values and timestamps, fills missing days, and tolerates reruns", async () => {
		await client.query(
			`INSERT INTO "ReferenceRate" ("type","date","value","updatedAt") VALUES ('CDI','2020-01-02',0.01,'2020-01-03')`,
		);
		const existing = (await client.query(`SELECT * FROM "ReferenceRate"`)).rows[0];
		const sql = referenceRateInsertSql(true);
		expect((await client.query(sql, ["CDI", "2020-01-02", 0.99])).rowCount).toBe(0);
		expect((await client.query(`SELECT * FROM "ReferenceRate"`)).rows[0]).toEqual(existing);
		expect((await client.query(sql, ["CDI", "2020-01-03", 0.02])).rowCount).toBe(1);
		expect((await client.query(sql, ["CDI", "2020-01-03", 0.02])).rowCount).toBe(0);
	});
	test("normal worker collection still corrects changed official values", async () => {
		await client.query(referenceRateInsertSql(false), ["SELIC", "2020-01-02", 0.01]);
		expect((await client.query(referenceRateInsertSql(false), ["SELIC", "2020-01-02", 0.02])).rowCount).toBe(
			1,
		);
		expect(
			Number((await client.query(`SELECT "value" FROM "ReferenceRate" WHERE "type"='SELIC'`)).rows[0].value),
		).toBe(0.02);
		expect((await client.query(referenceRateInsertSql(false), ["SELIC", "2020-01-02", 0.02])).rowCount).toBe(
			0,
		);
	});
});
