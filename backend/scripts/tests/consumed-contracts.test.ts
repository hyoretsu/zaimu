import { expect, test } from "bun:test";
import { readdir, readFile } from "node:fs/promises";
import { resolve } from "node:path";

async function sources(directory: string): Promise<string[]> {
	const entries = await readdir(directory, { withFileTypes: true });
	const nested = await Promise.all(
		entries
			.filter(entry => entry.name !== "generated")
			.map(async entry => {
				const file = resolve(directory, entry.name);
				return entry.isDirectory()
					? sources(file)
					: /\.tsx?$/.test(entry.name) && !entry.name.includes(".test.")
						? [await readFile(file, "utf8")]
						: [];
			}),
	);
	return nested.flat();
}

test("every consumed SDK operation has a concrete response contract", async () => {
	const root = resolve(import.meta.dir, "../../..");
	// Validate the current source contract in fresh worktrees and CI too.
	// Ignored output may be absent or belong to an earlier checkout.
	const exporter = Bun.spawn([process.execPath, "scripts/export-openapi.ts"], {
		cwd: resolve(root, "backend"),
		env: {
			...process.env,
			DATABASE_URL: "postgresql://unavailable:unavailable@127.0.0.1:1/unavailable",
			RABBITMQ_URL: "amqp://127.0.0.1:1",
			REDIS_URL: "redis://127.0.0.1:1",
		},
		stderr: "pipe",
		stdout: "ignore",
	});
	const [exitCode, error] = await Promise.all([exporter.exited, new Response(exporter.stderr).text()]);
	expect(error).not.toContain("ECONNREFUSED");
	expect(exitCode).toBe(0);
	const document = await Bun.file(resolve(root, "backend/out/openapi.json")).json();
	const operations = new Map<
		string,
		{ responses: Record<string, { content?: Record<string, { schema?: Record<string, unknown> }> }> }
	>();
	for (const methods of Object.values(document.paths)) {
		for (const operation of Object.values(
			methods as Record<
				string,
				{
					operationId: string;
					responses: Record<
						string,
						{ content?: Record<string, { schema?: Record<string, unknown> }> }
					>;
				}
			>,
		)) {
			expect(operations.has(operation.operationId)).toBe(false);
			operations.set(operation.operationId, operation);
		}
	}
	const consumed = new Set<string>();
	for (const source of await sources(resolve(root, "frontend/src"))) {
		for (const match of source.matchAll(
			/import\s*\{([^}]+)\}\s*from\s*["'][^"']*(?:\/api|\.\/api|\/generated\/api)["']/gs,
		)) {
			for (const item of match[1].split(",")) {
				const name = item.trim().split(/\s/)[0];
				if (/^(get|post|put|patch|delete)[A-Z]/.test(name) && !/(QueryKey|Schema)$/.test(name))
					consumed.add(name);
			}
		}
	}
	expect(consumed.size).toBeGreaterThan(100);
	for (const name of consumed) {
		const operation = operations.get(name);
		expect(operation, name).toBeDefined();
		if (!operation) continue;
		const success = Object.entries(operation.responses).filter(([status]) => /^2\d\d$/.test(status));
		// Explicitly forbidden endpoints have no successful response.
		expect(success.length > 0 || "403" in operation.responses, name).toBe(true);
		for (const [status, response] of success) {
			if (status === "204") continue;
			const schema = response.content?.["application/json"]?.schema;
			expect(schema && Object.keys(schema).length > 0, name).toBe(true);
		}
	}
}, 120_000);
