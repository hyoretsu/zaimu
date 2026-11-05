import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { closeDatabase } from "sql";
import contract from "../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";
import { listStoreRows } from "../infra/elysia/StoresController";

const url = requireFixtureUrl("DATABASE_TEST_URL");

describe("store catalog list", () => {
	beforeAll(async () => {
		const client = new Client({ connectionString: url });
		await client.connect();
		try {
			await installContractFixture(client, contract);
			await client.query("CREATE EXTENSION IF NOT EXISTS unaccent");
			await client.query(
				`CREATE OR REPLACE FUNCTION public.normalize_search(value TEXT) RETURNS TEXT LANGUAGE SQL IMMUTABLE PARALLEL SAFE
				 RETURN lower(public.unaccent('public.unaccent', coalesce(value, '')))`,
			);
			await client.query("SET session_replication_role = replica");
			await client.query(
				`INSERT INTO "user" ("id","email","name","role") VALUES ('a','a@test.invalid','A','USER'),('b','b@test.invalid','B','USER')`,
			);
			await client.query(
				`INSERT INTO "Store" ("id","name","normalizedName","userId") VALUES
				 ('s1','Zebra','zebra','a'),('s2','apple','apple','a'),('s3','Café Central','cafe central','a'),
				 ('s4','Apple','apple2','a'),('s5','Apple','apple3','a'),('s6','Café Other','cafe other','b')`,
			);
		} finally {
			await client.end();
		}
	});
	afterAll(() => closeDatabase());

	const names = (rows: { id: string }[]) => rows.map(row => row.id);

	test("orders byte-wise (C collation) by name then id and isolates users", async () => {
		expect(names(await listStoreRows("a", "", undefined, 50))).toEqual(["s4", "s5", "s3", "s1", "s2"]);
	});

	test("search ignores case and accents", async () => {
		expect(names(await listStoreRows("a", "CAFE", undefined, 50))).toEqual(["s3"]);
		expect(names(await listStoreRows("a", "café", undefined, 50))).toEqual(["s3"]);
		expect(names(await listStoreRows("a", "APPLE", undefined, 50))).toEqual(["s4", "s5", "s2"]);
		expect(names(await listStoreRows("b", "cafe", undefined, 50))).toEqual(["s6"]);
	});

	test("cursor continues after (name, id) in C order and respects the limit", async () => {
		const first = await listStoreRows("a", "", undefined, 2);
		expect(names(first)).toEqual(["s4", "s5"]);
		const afterS4 = await listStoreRows("a", "", { id: "s4", name: "Apple" }, 2);
		expect(names(afterS4)).toEqual(["s5", "s3"]);
		const tail = await listStoreRows("a", "", { id: "s2", name: "apple" }, 50);
		expect(names(tail)).toEqual([]);
	});
});
