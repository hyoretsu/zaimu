import { mkdir } from "node:fs/promises";
import { resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
const output = resolve(process.env.PERFORMANCE_MATRIX_DIR ?? "/tmp/zaimu-performance-matrix");
await mkdir(output, { recursive: true });
const sizes = [10, 10000, 100000];
const runs: { size: number; worker: string; code: number; report: string }[] = [];
let api: ReturnType<typeof Bun.spawn> | undefined;
let worker: ReturnType<typeof Bun.spawn> | undefined;
let runner: ReturnType<typeof Bun.spawn> | undefined;
let preparation: ReturnType<typeof Bun.spawn> | undefined;
let stopped = false;
const stop = () => {
	stopped = true;
	api?.kill();
	worker?.kill();
	runner?.kill();
	preparation?.kill();
};
process.on("SIGINT", stop);
process.on("SIGTERM", stop);
async function command(args: string[], env: Record<string, string | undefined>) {
	preparation = Bun.spawn(args, {
		cwd: root,
		env: { ...globalThis.process.env, ...env },
		stderr: "inherit",
		stdout: "inherit",
	});
	const code = await preparation.exited;
	preparation = undefined;
	if (code) throw new Error(`Local performance command failed (${code}): ${args.join(" ")}`);
}
try {
	const probe = Bun.listen({ hostname: "127.0.0.1", port: 3335, socket: { data() {} } });
	probe.stop();
	// Compose refuses pulls and publishes dedicated services only on loopback.
	await command(
		["docker", "compose", "-f", "backend/performance/compose.yml", "up", "-d", "--pull", "never"],
		{},
	);
	for (const size of sizes) {
		if (stopped) break;
		await command(["bun", "run", "backend/performance/seed.ts"], {
			DO_NOT_TRACK: "1",
			PERFORMANCE_DATABASE_URL:
				"postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance",
			PERFORMANCE_FIXTURE_SIZE: String(size),
			PERFORMANCE_FIXTURE_USERS: "20",
			PRISMA_TELEMETRY_DISABLED: "1",
		});
		for (const state of ["stopped", "active"]) {
			if (stopped) break;
			const log = `${output}/${size}-${state}-api.jsonl`;
			api = Bun.spawn(["bun", "run", "performance/start.ts"], {
				cwd: `${root}/backend`,
				env: { ...process.env, PERFORMANCE_API_ENTRY: "../dist/main.js" },
				stderr: Bun.file(`${log}.stderr`),
				stdout: Bun.file(log),
			});
			// Probe uses only a public local route; fixture login occurs inside acceptance.
			let ready = false;
			for (let attempt = 0; attempt < 60; attempt++) {
				try {
					const response = await fetch("http://127.0.0.1:3335/health", {
						redirect: "error",
						signal: AbortSignal.timeout(1000),
					});
					await response.arrayBuffer();
					if (response.ok && response.headers.get("x-performance-namespace") === "zaimu_performance") {
						ready = true;
						break;
					}
				} catch {
					/* API startup. */
				}
				await Bun.sleep(1000);
			}
			if (!ready) throw new Error("Dedicated release API failed startup");
			if (state === "active")
				worker = Bun.spawn(["bun", "run", "performance/start-worker.ts"], {
					cwd: `${root}/backend`,
					stderr: Bun.file(`${output}/${size}-worker.stderr`),
					stdout: Bun.file(`${output}/${size}-worker.jsonl`),
				});
			const report = `${output}/${size}-${state}.json`;
			runner = Bun.spawn(["bun", "run", "backend/performance/acceptance.ts"], {
				cwd: root,
				env: {
					...process.env,
					PERFORMANCE_API_LOG: log,
					PERFORMANCE_REPORT_PATH: report,
					PERFORMANCE_WORKER_STATE: state,
				},
				stderr: "inherit",
				stdout: "inherit",
			});
			const code = await runner.exited;
			runner = undefined;
			runs.push({ code, report, size, worker: state });
			api.kill();
			await api.exited;
			api = undefined;
			if (worker) {
				worker.kill();
				await worker.exited;
				worker = undefined;
			}
		}
	}
} catch (error) {
	console.error(error instanceof Error ? error.message : "matrix-error");
	process.exitCode = 1;
} finally {
	api?.kill();
	worker?.kill();
	runner?.kill();
	preparation?.kill();
	await Bun.write(
		`${output}/matrix.json`,
		JSON.stringify(
			{
				interrupted: stopped,
				passed: false,
				reason: "HTTP matrix does not replace browser/native/worker acceptance",
				runs,
			},
			null,
			2,
		),
	);
	if (runs.length !== sizes.length * 2 || runs.some(run => run.code !== 0)) process.exitCode = 1;
}
