import { afterAll, describe, expect, test } from "bun:test";
import { requireFixtureUrl } from "../../../../scripts/testing/fixture";
import {
	closeDatabase,
	db,
	getQueryMetrics,
	queryRaw,
	withQueryKind,
	withQueryMetrics,
	withRawTransaction,
} from "../index";

requireFixtureUrl("PERFORMANCE_DATABASE_URL");
const suite = describe;
suite("physical PostgreSQL instrumentation", () => {
	test("counts raw, ORM auth and transaction control once", async () => {
		await withQueryMetrics(async () => {
			await queryRaw("SELECT 1");
			expect(getQueryMetrics()?.queryCount).toBe(1);
			await withQueryKind("auth", () =>
				db.orm.public.User.where(user => user.id.eq("performance-user" as never)).first(),
			);
			expect(getQueryMetrics()?.authQueryCount).toBeGreaterThan(0);
			await withRawTransaction(query => query("SELECT 1"));
			expect(getQueryMetrics()?.queryCount).toBe(getQueryMetrics()!.authQueryCount + 4);
			expect(getQueryMetrics()?.businessQueryCount).toBe(4);
		});
	});
	test("parallel delayed queries retain their own request context", async () => {
		const results = await Promise.all(
			[1, 2, 3].map(count =>
				withQueryMetrics(async () => {
					await Promise.all(Array.from({ length: count }, () => queryRaw("SELECT pg_sleep(0.02)")));
					return { ...getQueryMetrics()! };
				}),
			),
		);
		expect(results.map(result => result.queryCount)).toEqual([1, 2, 3]);
		expect(new Set(results.map(result => result.requestId)).size).toBe(3);
	});
	afterAll(closeDatabase);
});
