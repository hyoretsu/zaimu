const staged = Bun.spawnSync(["git", "diff", "--cached", "--name-only", "-z"]);
if (staged.exitCode !== 0) process.exit(staged.exitCode);
const paths = staged.stdout.toString().split("\0");
if (
	paths.some(
		path =>
			path === "scripts/test-runner.ts" ||
			path === "scripts/tsconfig.json" ||
			path.startsWith("scripts/testing/") ||
			path.startsWith("scripts/agent-hooks/"),
	)
) {
	const check = Bun.spawnSync(["bun", "check", "--project", "scripts/tsconfig.json"], {
		stderr: "inherit",
		stdout: "inherit",
	});
	if (check.exitCode !== 0) process.exit(check.exitCode);
}
const sql = paths.some(path => path.startsWith("packages/sql/"));
const finance = paths.some(path => path.startsWith("packages/finance/"));
const shared = paths.some(path => path.startsWith("shared/"));
const backend = shared || sql || finance || paths.some(path => path.startsWith("backend/"));
const frontend = shared || finance || paths.some(path => path.startsWith("frontend/"));
const packages = [
	...(sql ? ["sql"] : []),
	...(finance ? ["@zaimu/finance"] : []),
	...(backend ? ["backend"] : []),
	...(frontend ? ["frontend"] : []),
];
if (packages.length) {
	const check = Bun.spawnSync(
		[
			"bun",
			"x",
			"--no-install",
			"turbo",
			"run",
			"check-types",
			...packages.flatMap(name => ["--filter", name]),
		],
		{ stderr: "inherit", stdout: "inherit" },
	);
	if (check.exitCode !== 0) process.exit(check.exitCode);
}
if (shared || paths.some(path => path.startsWith("backend/src/"))) {
	const test = Bun.spawnSync(["bun", "run", "test:unit", "--coverage"], {
		cwd: "backend",
		stderr: "inherit",
		stdout: "inherit",
	});
	if (test.exitCode !== 0) process.exit(test.exitCode);
}
