import { expect, test } from "bun:test";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";

test("ignores deploy refs and source changes, restarts after stable migration changes", async () => {
	const root = await mkdtemp(join(tmpdir(), "zaimu-migration-watch-"));
	const target = Bun.spawn(["sleep", "30"]);
	let watcher: ReturnType<typeof Bun.spawn> | undefined;
	try {
		await mkdir(join(root, "packages/sql/migrations/app/refs"), { recursive: true });
		await mkdir(join(root, "packages/sql/src/prisma"), { recursive: true });
		await writeFile(join(root, "packages/sql/prisma.config.ts"), "initial");
		watcher = Bun.spawn(["sh", new URL("./dev-migration-watch.sh", import.meta.url).pathname], {
			env: {
				...process.env,
				DEV_WATCH_INTERVAL: "0.1",
				DEV_WATCH_PID: String(target.pid),
				DEV_WATCH_ROOT: root,
			},
			stderr: "pipe",
			stdout: "pipe",
		});
		await Bun.sleep(300);
		await writeFile(join(root, "packages/sql/migrations/app/refs/db.json"), "deploy state");
		await writeFile(join(root, "packages/sql/src/index.ts"), "source change");
		await Bun.sleep(400);
		expect(target.exitCode).toBeNull();
		expect(watcher.exitCode).toBeNull();
		await writeFile(join(root, "packages/sql/migrations/app/migration.ts"), "new migration");
		await Promise.race([
			watcher.exited,
			Bun.sleep(3000).then(() => {
				throw new Error("Watcher did not restart target");
			}),
		]);
		expect(await watcher.exited).toBe(0);
		await target.exited;
		expect(await new Response(watcher.stdout).text()).toContain("restarting development container");
	} finally {
		watcher?.kill();
		target.kill();
		await watcher?.exited;
		await target.exited;
		await rm(root, { force: true, recursive: true });
	}
});
