const databaseTestUrl = process.env.DATABASE_TEST_URL;

if (!databaseTestUrl) {
	console.log("E2E ignorado: DATABASE_TEST_URL ausente");
	process.exit(0);
}

if (databaseTestUrl === process.env.DATABASE_URL) {
	throw new Error("DATABASE_TEST_URL deve apontar para banco descartável distinto de DATABASE_URL");
}

const environment = {
	...process.env,
	BETTER_AUTH_SECRET: process.env.BETTER_AUTH_SECRET ?? "zaimu-e2e-secret-with-at-least-32-characters",
	DATABASE_URL: databaseTestUrl,
	NODE_ENV: "test",
};

const migrate = Bun.spawnSync(["bun", "run", "migrate:deploy"], {
	cwd: new URL("../../packages/sql", import.meta.url).pathname,
	env: environment,
	stderr: "inherit",
	stdout: "inherit",
});
if (migrate.exitCode !== 0) process.exit(migrate.exitCode);

const tests = Bun.spawnSync(["bun", "test", "--timeout", "120000", "tests/database.e2e.test.ts"], {
	cwd: new URL("..", import.meta.url).pathname,
	env: environment,
	stderr: "inherit",
	stdout: "inherit",
});
process.exit(tests.exitCode);
