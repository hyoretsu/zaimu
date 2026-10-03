import { expect, test } from "bun:test";

const readNames = (nodeEnv: string, namespace = "") => {
	const result = Bun.spawnSync({
		cmd: [
			process.execPath,
			"-e",
			`import { cacheKey, brokerExchange, brokerQueue } from "./service-namespace.ts"; console.log(JSON.stringify([cacheKey("cache:cleanup"), brokerExchange("zaimu.commands"), brokerQueue("reference-rate-fetch")]));`,
		],
		cwd: import.meta.dir,
		env: { ...process.env, NODE_ENV: nodeEnv, SERVICE_NAMESPACE: namespace },
	});
	if (result.exitCode !== 0) throw new Error(result.stderr.toString());
	return JSON.parse(result.stdout.toString());
};

test("development and test resources cannot collide with production", () => {
	for (const environment of ["development", "test", ""])
		expect(readNames(environment)).toEqual([
			"zaimu_dev:cache:cleanup",
			"zaimu_dev.commands",
			"zaimu_dev:reference-rate-fetch",
		]);
});

test("production preserves cache keys, exchanges and existing queues", () => {
	expect(readNames("production")).toEqual(["zaimu:cache:cleanup", "zaimu.commands", "reference-rate-fetch"]);
});

test("explicit namespace overrides environment defaults", () => {
	expect(readNames("production", " zaimu_staging ")).toEqual([
		"zaimu_staging:cache:cleanup",
		"zaimu_staging.commands",
		"zaimu_staging:reference-rate-fetch",
	]);
});
