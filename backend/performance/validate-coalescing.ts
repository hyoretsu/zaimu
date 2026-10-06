import { RedisClient } from "bun";

const namespace = `zaimu_performance_coalescing_${crypto.randomUUID()}`;
const owner = crypto.randomUUID();
const client = new RedisClient("redis://127.0.0.1:6395");
const launch = () =>
	Bun.spawn([process.execPath, new URL("./fixtures/cache-loader.ts", import.meta.url).pathname, owner], {
		env: { ...process.env, NODE_ENV: "test", SERVICE_NAMESPACE: namespace },
		stderr: "pipe",
		stdout: "pipe",
	});
try {
	const first = launch();
	await Bun.sleep(250);
	const second = launch();
	await Bun.sleep(11000);
	const third = launch();
	const results = await Promise.all(
		[first, second, third].map(async child => {
			const [output, error, code] = await Promise.all([
				new Response(child.stdout).text(),
				new Response(child.stderr).text(),
				child.exited,
			]);
			const result = output.split("\n").find(line => line.startsWith("RESULT:"));
			if (code !== 0 || !result) throw new Error(`Loader process failed: ${error.slice(0, 500)}`);
			return {
				...JSON.parse(result.slice(7)),
				diagnostics: output.split("\n").filter(line => line && !line.startsWith("RESULT:")),
				stderr: error,
			};
		}),
	);
	const loads = Number(await client.get(`${namespace}:coalescing:${owner}:loads`));
	const passed = loads === 1 && results.every(result => result.value.complete);
	const report = { durationBeyondLeaseMs: 2000, loads, passed, processes: results.length, results };
	await Bun.write(
		process.env.PERFORMANCE_REPORT_PATH ?? new URL("./coalescing-0018.json", import.meta.url),
		JSON.stringify(report, null, 2),
	);
	console.info(JSON.stringify(report));
	if (!passed) throw new Error("Cross-process coalescing failed");
} finally {
	let cursor = "0";
	do {
		const [next, keys] = (await client.send("SCAN", [
			cursor,
			"MATCH",
			`${namespace}:*`,
			"COUNT",
			"1000",
		])) as [string, string[]];
		if (keys.length) await client.send("UNLINK", keys);
		cursor = next;
	} while (cursor !== "0");
	client.close();
}
