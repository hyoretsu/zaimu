import { expect, test } from "bun:test";
import { withQueryMetrics } from "sql";
import { RedisBudget } from "./RedisBudget";

test("limits whole request Redis waits and skips calls during failure", async () => {
	const budget = new RedisBudget(1000, 40);
	let attempts = 0;
	const never = () => {
		attempts++;
		return new Promise<string>(() => {});
	};
	await withQueryMetrics(async () => {
		const start = performance.now();
		for (let index = 0; index < 10; index++) await budget.run(never).catch(() => {});
		expect(performance.now() - start).toBeLessThan(100);
	});
	expect(attempts).toBe(1);
});
test("allows one recovery probe, then resumes", async () => {
	const budget = new RedisBudget(5, 30);
	await budget
		.run(async () => {
			throw new Error("offline");
		})
		.catch(() => {});
	await Bun.sleep(8);
	let release!: (value: string) => void;
	const recovery = budget.run(
		() =>
			new Promise<string>(resolve => {
				release = resolve;
			}),
	);
	await expect(budget.run(async () => "parallel")).rejects.toThrow("circuit-open");
	release("ready");
	expect(await recovery).toBe("ready");
	expect(await budget.run(async () => "ok")).toBe("ok");
});
