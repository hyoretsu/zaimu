import { describe, expect, test } from "bun:test";
import {
	getQueryMetrics,
	measureOperation,
	startQuery,
	withoutQueryMetrics,
	withQueryKind,
	withQueryMetrics,
} from "./query-metrics";

describe("query metrics", () => {
	test("isolates concurrent requests, counts auth once and separates elapsed from accumulated SQL", async () => {
		const query = async () => {
			const finish = startQuery();
			await Bun.sleep(20);
			finish();
			finish();
		};
		const [first, second] = await Promise.all([
			withQueryMetrics(async () => {
				await Promise.all([withQueryKind("auth", query), query()]);
				return { ...getQueryMetrics()! };
			}),
			withQueryMetrics(async () => {
				await query();
				return { ...getQueryMetrics()! };
			}),
		]);
		expect(first.queryCount).toBe(2);
		expect(first.authQueryCount).toBe(1);
		expect(first.businessQueryCount).toBe(1);
		expect(first.sqlDurationMs).toBeGreaterThan(first.sqlElapsedMs * 1.5);
		expect(second.queryCount).toBe(1);
		expect(second.requestId).not.toBe(first.requestId);
		expect(getQueryMetrics()).toBeUndefined();
	});
	test("detaches background work and freezes completed request metrics", async () => {
		await withQueryMetrics(async () => {
			const metrics = getQueryMetrics()!;
			await withoutQueryMetrics(async () => {
				const finish = startQuery();
				finish();
			});
			expect(metrics.queryCount).toBe(0);
			const finish = startQuery();
			metrics.active = false;
			finish();
			expect(metrics.queryCount).toBe(0);
		});
	});
	test("records failed spans without recording payloads", async () => {
		await withQueryMetrics(async () => {
			await expect(
				measureOperation("loader", async () => {
					throw new Error("failure");
				}),
			).rejects.toThrow("failure");
			expect(getQueryMetrics()?.spans[0]?.outcome).toBe("error");
		});
	});
});
