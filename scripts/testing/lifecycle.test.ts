import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";

const root = resolve(import.meta.dir, "../..");
for (const scenario of ["missing-docker", "missing-image", "timeout", "interrupt"]) {
	test(`runner fails and cleans up: ${scenario}`, async () => {
		const temporary = await mkdtemp(join(tmpdir(), "zaimu-runner-regression-"));
		const log = join(temporary, "commands.log");
		const output = join(temporary, "output.log");
		let child: ReturnType<typeof Bun.spawn> | undefined;
		try {
			await Bun.write(
				join(temporary, "docker"),
				`#!/bin/sh
printf '%s\\n' "$*" >> "$FAKE_DOCKER_LOG"
[ "$FAKE_DOCKER_MODE" = missing-docker ] && exit 127
[ "$1 $2" = "image inspect" ] && [ "$FAKE_DOCKER_MODE" = missing-image ] && exit 1
case "$1" in
 context) printf '%s\\n' unix:///var/run/docker.sock ;;
 run) printf '%s\\n' fake-container ;;
 port) printf '%s\\n' 127.0.0.1:32501 ;;
 exec) [ "$FAKE_DOCKER_MODE" = interrupt ] && exec sleep 30; exit 1 ;;
esac
exit 0
`,
			);
			const chmod = Bun.spawn(["chmod", "+x", join(temporary, "docker")]);
			expect(await chmod.exited).toBe(0);
			child = Bun.spawn(["bun", "scripts/test-runner.ts", "sql", "integration"], {
				cwd: root,
				env: {
					...process.env,
					FAKE_DOCKER_LOG: log,
					FAKE_DOCKER_MODE: scenario,
					PATH: `${temporary}:${process.env.PATH}`,
					TEST_SERVICE_TIMEOUT_MS: scenario === "interrupt" ? "60000" : "1",
				},
				stderr: Bun.file(output),
				stdout: Bun.file(output),
				timeout: 40000,
			});
			if (scenario === "interrupt") {
				const deadline = Date.now() + 30000;
				while (Date.now() < deadline) {
					if ((await Bun.file(log).exists()) && (await readFile(log, "utf8")).includes("exec "))
						break;
					await Bun.sleep(50);
				}
				expect(await readFile(log, "utf8")).toContain("exec ");
				child.kill("SIGTERM");
			}
			const code = await child.exited;
			const commands = await readFile(log, "utf8");
			expect(code).toBe(scenario === "interrupt" ? 130 : 1);
			if (scenario === "timeout" || scenario === "interrupt")
				expect(commands.match(/^rm -f -v /gm)?.length).toBe(3);
			else expect(commands).not.toContain("run --pull");
		} finally {
			child?.kill();
			await rm(temporary, { force: true, recursive: true });
		}
	}, 45000);
}
