export interface TestFixture {
	databases: string[];
	redis: string;
	broker: string;
	namespace: string;
	unavailableRedis: string;
}
function fixture(environment: Record<string, string | undefined> = process.env): TestFixture {
	const value = environment.ZAIMU_TEST_FIXTURE;
	if (!value)
		throw new Error("Disposable fixture required. Run bun run test through scripts/test-runner.ts.");
	const result = JSON.parse(value) as TestFixture;
	if (
		!/^zaimu_test_[a-z0-9_]+$/.test(result.namespace) ||
		environment.SERVICE_NAMESPACE !== result.namespace
	)
		throw new Error("Invalid disposable test namespace");
	return result;
}
export function assertFixtureUrl(value: string, environment?: Record<string, string | undefined>): string {
	const url = new URL(value);
	const config = fixture(environment);
	if (
		!["postgresql:", "postgres:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		!url.port ||
		!config.databases.includes(value) ||
		!url.pathname.startsWith(`/${config.namespace}_`)
	)
		throw new Error("Database must belong to this runner's disposable local fixture");
	return value;
}
export function assertFixtureServiceUrl(value: string, kind?: "redis" | "broker"): string {
	const config = fixture();
	const url = new URL(value);
	if (
		!["redis:", "amqp:"].includes(url.protocol) ||
		url.hostname !== "127.0.0.1" ||
		!url.port ||
		!(kind
			? value === config[kind]
			: [config.redis, config.broker, config.unavailableRedis].includes(value))
	)
		throw new Error("Service must belong to this runner's disposable local fixture");
	return value;
}
export function requireFixtureUrl(name: string): string {
	const value = process.env[name];
	if (!value) throw new Error(`${name} required. Run bun run test through scripts/test-runner.ts.`);
	return name.includes("REDIS") || name.includes("BROKER")
		? assertFixtureServiceUrl(value)
		: assertFixtureUrl(value);
}
