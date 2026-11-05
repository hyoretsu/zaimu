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
const observability = paths.some(path => path.startsWith("packages/observability/"));
const sql = paths.some(path => path.startsWith("packages/sql/"));
const finance = paths.some(path => path.startsWith("packages/finance/"));
const shared = paths.some(path => path.startsWith("shared/"));
const backend = observability || shared || sql || finance || paths.some(path => path.startsWith("backend/"));
const frontend = observability || shared || finance || paths.some(path => path.startsWith("frontend/"));
const packages = [
	...(observability ? ["@zaimu/observability"] : []),
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
	const test = Bun.spawnSync(["bun", "run", "test:unit", "--changed", "--coverage"], {
		cwd: "backend",
		stderr: "inherit",
		stdout: "inherit",
	});
	if (test.exitCode !== 0) process.exit(test.exitCode);
}

if (observability) {
	const test = Bun.spawnSync(["bun", "test", "packages/observability/src"], {
		stderr: "inherit",
		stdout: "inherit",
	});
	if (test.exitCode) process.exit(test.exitCode);
}
