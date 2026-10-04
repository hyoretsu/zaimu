const staged = Bun.spawnSync(["git", "diff", "--cached", "--name-only", "-z"]);
if (staged.exitCode !== 0) process.exit(staged.exitCode);
const paths = staged.stdout.toString().split("\0");
const sql = paths.some(path => path.startsWith("packages/sql/"));
const finance = paths.some(path => path.startsWith("packages/finance/"));
const backend = sql || finance || paths.some(path => path.startsWith("backend/"));
const frontend = finance || paths.some(path => path.startsWith("frontend/"));
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
if (paths.some(path => path.startsWith("backend/src/"))) {
	const test = Bun.spawnSync(["bun", "test", "src", "--coverage"], {
		cwd: "backend",
		env: {
			...process.env,
			CACHE_TEST_REDIS_URL: "",
			DATABASE_TEST_URL: "",
			DATABASE_URL: "postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance",
			NODE_ENV: "test",
			RABBITMQ_URL: "amqp://performance:performance-local@127.0.0.1:56795",
			REDIS_URL: "redis://127.0.0.1:6395",
			SERVICE_NAMESPACE: "zaimu_performance_unit",
		},
		stderr: "inherit",
		stdout: "inherit",
	});
	if (test.exitCode !== 0) process.exit(test.exitCode);
}
