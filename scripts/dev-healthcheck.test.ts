import { expect, test } from "bun:test";
import { mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

async function probe(mode: string) {
	const directory = await mkdtemp(join(tmpdir(), "zaimu-health-"));
	const preload = join(directory, "mock.ts");
	await writeFile(
		preload,
		`import { mock } from "bun:test";
mock.module(${JSON.stringify(import.meta.resolve("dotenv"))}, () => ({ config() {} }));
mock.module(${JSON.stringify(import.meta.resolve("pg"))}, () => ({ default: { Client: class {
 async connect() {} async query(sql) { if (sql !== "SELECT 1") throw Error("write"); } async end() {}
} } }));
const { createServer } = await import("node:net");
const redis = createServer(socket => {
 socket.on("data", data => {
  if (${JSON.stringify(mode)} === "redis-failure") socket.destroy();
  else if (data.toString().includes("HELLO")) socket.write(${JSON.stringify(["%1", "+proto", ":3", ""].join(String.fromCharCode(13, 10)))});
  else socket.write(${JSON.stringify(["+PONG", ""].join(String.fromCharCode(13, 10)))});
 });
});
await new Promise(resolve => redis.listen(0, "127.0.0.1", resolve));
process.env.REDIS_URL = "redis://127.0.0.1:" + redis.address().port;
mock.module(${JSON.stringify(import.meta.resolve("amqplib"))}, () => ({ default: { async connect() { return { on() {}, async close() {} }; } } }));
globalThis.fetch = async () => ${mode === "timeout" ? "new Promise(() => {})" : 'new Response("ok")'};
`,
	);
	try {
		const child = Bun.spawn([process.execPath, "--preload", preload, "../scripts/dev-healthcheck.ts"], {
			cwd: new URL("../backend", import.meta.url).pathname,
			env: { ...process.env, DATABASE_URL: "postgres://unused", REDIS_URL: "redis://unused" },
			stderr: "pipe",
			stdout: "pipe",
		});
		const output = await new Response(child.stdout).text();
		const errors = await new Response(child.stderr).text();
		if (!output) throw new Error(errors);
		return { code: await child.exited, output, results: JSON.parse(output) };
	} finally {
		await rm(directory, { recursive: true });
	}
}

test("healthy only when every service passes", async () => {
	const result = await probe("ok");
	expect(result.results).toEqual({
		api: "ok",
		frontend: "ok",
		postgres: "ok",
		rabbitmq: "ok",
		redis: "ok",
	});
	expect(result.code).toBe(0);
	expect(result.results).toEqual({
		api: "ok",
		frontend: "ok",
		postgres: "ok",
		rabbitmq: "ok",
		redis: "ok",
	});
}, 20000);

test("dependency failure marks unhealthy without exposing driver credentials", async () => {
	const result = await probe("redis-failure");
	expect(result.code).toBe(1);
	expect(result.results.redis).toBe("failed");
	expect(result.output).not.toContain("secret-password");
}, 20000);

test("stalled checks exit within global deadline and retain completed results", async () => {
	const result = await probe("timeout");
	expect(result.code).toBe(1);
	expect(result.results.api).toBe("timeout");
	expect(result.results.frontend).toBe("timeout");
	expect(result.results.postgres).toBe("ok");
}, 20000);

test("restart policy honors grace, resets on recovery, and signals only after three failures", async () => {
	const directory = await mkdtemp(join(tmpdir(), "zaimu-health-policy-"));
	try {
		const source = await Bun.file(new URL("./dev-healthcheck.sh", import.meta.url)).text();
		const script = join(directory, "probe.sh");
		const started = join(directory, "started");
		const failures = join(directory, "failures");
		const signal = join(directory, "signal");
		await writeFile(join(directory, "bun"), '#!/bin/sh\nexit "$PROBE_STATUS"\n', { mode: 0o755 });
		await writeFile(
			script,
			source
				.replaceAll("/tmp/zaimu-dev-started-at", started)
				.replaceAll("/tmp/zaimu-dev-health-failures", failures),
		);
		const run = async (status: number) => {
			const child = Bun.spawn(
				["sh", "-c", 'kill() { printf "%s" "$*" > "$SIGNAL_FILE"; }; . "$PROBE_SCRIPT"'],
				{
					env: {
						...process.env,
						PATH: `${directory}:${process.env.PATH}`,
						PROBE_SCRIPT: script,
						PROBE_STATUS: String(status),
						SIGNAL_FILE: signal,
					},
					stderr: "pipe",
					stdout: "ignore",
				},
			);
			return await child.exited;
		};
		await writeFile(started, String(Math.floor(Date.now() / 1000)));
		await run(1);
		expect(await Bun.file(failures).exists()).toBe(false);
		await writeFile(started, "0");
		await run(1);
		await run(1);
		expect(await Bun.file(signal).exists()).toBe(false);
		expect(await run(0)).toBe(0);
		expect((await Bun.file(failures).text()).trim()).toBe("0");
		await run(1);
		await run(1);
		expect(await Bun.file(signal).exists()).toBe(false);
		expect(await run(1)).toBe(1);
		expect(await Bun.file(signal).text()).toBe("-TERM 1");
	} finally {
		await rm(directory, { recursive: true });
	}
}, 20000);
