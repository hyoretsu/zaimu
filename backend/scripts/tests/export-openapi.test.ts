import { describe, expect, it } from "bun:test";
import { resolve } from "node:path";

describe("local OpenAPI export", () => {
	it("exports reproducibly with unavailable infrastructure", async () => {
		const run = async () => {
			const child = Bun.spawn([process.execPath, "scripts/export-openapi.ts"], {
				cwd: resolve(import.meta.dir, "../.."),
				env: {
					...process.env,
					DATABASE_URL: "postgresql://unavailable:unavailable@127.0.0.1:1/unavailable",
					RABBITMQ_URL: "amqp://127.0.0.1:1",
					REDIS_URL: "redis://127.0.0.1:1",
				},
				stderr: "pipe",
				stdout: "pipe",
			});
			const [code, error] = await Promise.all([child.exited, new Response(child.stderr).text()]);
			expect(error).not.toContain("ECONNREFUSED");
			expect(code).toBe(0);
			return Bun.file(resolve(import.meta.dir, "../../out/openapi.json")).text();
		};
		const first = await run();
		expect(await run()).toBe(first);
		const document = JSON.parse(first);
		const operations = Object.values(document.paths).flatMap(methods => Object.values(methods as object));
		const ids = operations.map(operation => (operation as { operationId: string }).operationId);
		expect(new Set(ids).size).toBe(ids.length);
		expect(ids.length).toBeGreaterThan(150);
	}, 120_000);
});
