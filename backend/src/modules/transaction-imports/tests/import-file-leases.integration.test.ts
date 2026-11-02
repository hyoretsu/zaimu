import { afterAll, beforeAll, describe, expect, test } from "bun:test";
import { Client } from "pg";
import { requireFixtureUrl } from "../../../../../scripts/testing/fixture";

const url = requireFixtureUrl("DATABASE_TEST_URL");
describe("durable import file leases", () => {
	const schema = `import_jobs_${crypto.randomUUID().replaceAll("-", "")}`;
	const client = new Client({ connectionString: url });
	beforeAll(async () => {
		await client.connect();
		await client.query(`CREATE SCHEMA "${schema}"`);
		await client.query(`SET search_path TO "${schema}",public`);
		await client.query(`CREATE TABLE "ImportFileJob" (LIKE public."ImportFileJob" INCLUDING ALL)`);
	});
	afterAll(async () => {
		await client.query(`DROP SCHEMA IF EXISTS "${schema}" CASCADE`);
		await client.end();
	});
	test("earlier unfinished file blocks successors and expired tokens cannot finish", async () => {
		await client.query(
			`INSERT INTO "ImportFileJob" ("id","batchId","userId","kind","scopeId","ordinal","status","fileName","fileType","fileBytes","provider","password","workerToken","lockedUntil") VALUES ('first','batch','owner','account','account',0,'RUNNING','one.pdf','application/pdf','bytes','INTER','secret','old',now()-interval '1 second'),('second','batch','owner','account','account',1,'QUEUED','two.pdf','application/pdf','bytes','INTER',NULL,NULL,NULL)`,
		);
		const ready = await client.query(
			`SELECT j."id" FROM "ImportFileJob" j WHERE NOT EXISTS (SELECT 1 FROM "ImportFileJob" p WHERE p."kind"=j."kind" AND p."scopeId"=j."scopeId" AND p."status" IN ('QUEUED','RUNNING') AND (p."createdAt",p."batchId",p."ordinal") < (j."createdAt",j."batchId",j."ordinal"))`,
		);
		expect(ready.rows.map(row => row.id)).toEqual(["first"]);
		await client.query(
			`UPDATE "ImportFileJob" SET "workerToken"='new',"lockedUntil"=now()+interval '2 minutes' WHERE "id"='first'`,
		);
		const stale = await client.query(
			`UPDATE "ImportFileJob" SET "status"='FAILED' WHERE "id"='first' AND "workerToken"='old' AND "lockedUntil">now() RETURNING "id"`,
		);
		expect(stale.rows).toHaveLength(0);
		await client.query("BEGIN");
		await client.query(
			`UPDATE "ImportFileJob" SET "status"='SUCCEEDED',"fileBytes"=NULL,"password"=NULL WHERE "id"='first' AND "workerToken"='new'`,
		);
		await client.query("ROLLBACK");
		expect(
			(await client.query(`SELECT "status","fileBytes" FROM "ImportFileJob" WHERE "id"='first'`))
				.rows[0],
		).toEqual({ fileBytes: "bytes", status: "RUNNING" });
		await client.query(
			`UPDATE "ImportFileJob" SET "status"='FAILED',"fileBytes"=NULL,"password"=NULL WHERE "id"='first' AND "workerToken"='new'`,
		);
		expect(
			(await client.query(`SELECT "fileBytes","password" FROM "ImportFileJob" WHERE "id"='first'`))
				.rows[0],
		).toEqual({ fileBytes: null, password: null });
	});
});
