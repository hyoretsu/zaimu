const runner = Bun.spawn(["bun", "run", "../scripts/test-runner.ts", "backend", "e2e"], {
	cwd: new URL("..", import.meta.url).pathname,
	env: process.env,
	stderr: "inherit",
	stdout: "inherit",
});
process.exit(await runner.exited);
