import { mkdtemp, readdir, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join, resolve } from "node:path";
import { RedisClient, SQL } from "bun";
import { prepareSchema } from "./testing/prepare-schema";
import manifest from "./testing/test-manifest.json";
import {
	assertCompleteReport,
	assertLocalDockerSocket,
	assertTestClassification,
} from "./testing/validation";

const root = resolve(import.meta.dir, "..");
const targets = new Set(["backend", "sql"]);
const categories = new Set(["unit", "integration", "e2e", "all"]);
const args = process.argv.slice(2);
const target = args.shift() ?? "backend";
const category = args.shift() ?? "all";
if (
	!targets.has(target) ||
	!categories.has(category) ||
	args.some(arg => !["--changed", "--coverage"].includes(arg))
)
	throw new Error(
		"Usage: bun scripts/test-runner.ts <backend|sql> <all|unit|integration|e2e> [--changed] [--coverage]",
	);
const temp = await mkdtemp(join(tmpdir(), "zaimu-tests-"));
const namespace = `zaimu_test_${crypto.randomUUID().replaceAll("-", "")}`;
const commandTimeoutMs = Number(process.env.TEST_COMMAND_TIMEOUT_MS ?? 120000);
const containers: string[] = [];
const createdDatabases: string[] = [];
let externalAdmin: SQL | undefined;
let externalRedis: RedisClient | undefined;
let externalBroker: URL | undefined;
let child: ReturnType<typeof Bun.spawn> | undefined;
let interrupted = false;
const commands = new Set<ReturnType<typeof Bun.spawn>>();
console.log(`Disposable test run: ${namespace} (${target}:${category})`);
async function command(command: string[], env?: Record<string, string | undefined>, cwd = root) {
	const process = Bun.spawn(command, {
		cwd,
		env,
		stderr: "pipe",
		stdout: "pipe",
		timeout: commandTimeoutMs,
	});
	commands.add(process);
	const [stdout, stderr, code] = await Promise.all([
		new Response(process.stdout).text(),
		new Response(process.stderr).text(),
		process.exited,
	]);
	commands.delete(process);
	if (code) throw new Error(`${command.join(" ")} failed (${code})\n${stdout}${stderr}`);
	return stdout.trim();
}
/** Best effort through the RabbitMQ management API: removes only this run's namespaced queues/exchanges. */
async function cleanupBroker(url: URL) {
	const base = process.env.RABBITMQ_DEV_MANAGEMENT_URL ?? `http://${url.hostname}:15672`;
	const headers = {
		authorization: `Basic ${btoa(`${decodeURIComponent(url.username)}:${decodeURIComponent(url.password)}`)}`,
	};
	const vhost = encodeURIComponent(decodeURIComponent(url.pathname.slice(1)) || "/");
	for (const kind of ["queues", "exchanges"]) {
		const response = await fetch(`${base}/api/${kind}/${vhost}`, { headers });
		if (!response.ok)
			return console.warn(`RabbitMQ cleanup skipped (${response.status}): ${namespace}_*`);
		for (const { name } of (await response.json()) as { name: string }[])
			if (name.includes(`${namespace}_`))
				await fetch(`${base}/api/${kind}/${vhost}/${encodeURIComponent(name)}`, {
					headers,
					method: "DELETE",
				});
	}
}
async function cleanup() {
	child?.kill("SIGTERM");
	for (const name of createdDatabases)
		await externalAdmin?.unsafe(`DROP DATABASE IF EXISTS "${name}" WITH (FORCE)`).catch(error => {
			console.error(error);
			process.exitCode ||= 1;
		});
	await externalAdmin?.close().catch(() => undefined);
	if (externalRedis) {
		const keys = (await externalRedis.send("KEYS", [`${namespace}_*`]).catch(() => [])) as string[];
		if (keys.length) await externalRedis.send("DEL", keys).catch(error => console.error(error));
		externalRedis.close();
	}
	if (externalBroker) await cleanupBroker(externalBroker).catch(error => console.error(error));
	for (const container of containers.reverse())
		await command(["docker", "rm", "-f", "-v", container]).catch(error => {
			console.error(error);
			process.exitCode ||= 1;
		});
	await rm(temp, { force: true, recursive: true });
}
for (const signal of ["SIGINT", "SIGTERM"] as const)
	process.on(signal, () => {
		interrupted = true;
		child?.kill(signal);
		for (const process of commands) process.kill(signal);
	});
async function files(directory: string): Promise<string[]> {
	const result: string[] = [];
	for (const entry of await readdir(join(root, directory), { withFileTypes: true })) {
		if (["node_modules", ".git", "dist", "coverage", "out"].includes(entry.name)) continue;
		const path = `${directory}/${entry.name}`;
		if (entry.isDirectory()) result.push(...(await files(path)));
		else if (/\.(test|spec)\.[cm]?[jt]sx?$/.test(entry.name)) result.push(path);
	}
	return result;
}
async function service(name: string, image: string, port: number, env: string[] = []) {
	await command(["docker", "image", "inspect", image]);
	const container = `${namespace}_${name}`;
	containers.push(container);
	const reservation = Bun.serve({ fetch: () => new Response(), hostname: "127.0.0.1", port: 0 });
	const hostPort = reservation.port;
	reservation.stop(true);
	await command([
		"docker",
		"run",
		"--pull=never",
		"-d",
		"--name",
		container,
		"--label",
		`zaimu.test-run=${namespace}`,
		"-p",
		`127.0.0.1:${hostPort}:${port}`,
		...(name === "rabbitmq" ? ["--entrypoint", "sh"] : []),
		...env.flatMap(value => ["-e", value]),
		image,
		...(name === "rabbitmq"
			? [
					"-c",
					"printf disposable-local-cookie > /var/lib/rabbitmq/.erlang.cookie; chown 999:999 /var/lib/rabbitmq/.erlang.cookie; chmod 600 /var/lib/rabbitmq/.erlang.cookie; exec docker-entrypoint.sh rabbitmq-server",
				]
			: []),
	]);
	const output = await command(["docker", "port", container, `${port}/tcp`]);
	const assigned = output.match(/^127\.0\.0\.1:(\d+)$/)?.[1];
	if (!assigned) throw new Error(`Invalid loopback port: ${output}`);
	return { container, port: assigned };
}
async function ready(container: string, check: string[]) {
	const deadline = Date.now() + Number(process.env.TEST_SERVICE_TIMEOUT_MS ?? 60000);
	let error: unknown;
	while (Date.now() < deadline) {
		if (interrupted) throw new Error("Test execution interrupted");
		try {
			await command(["docker", "exec", container, ...check]);
			return;
		} catch (failure) {
			error = failure;
		}
		await Bun.sleep(250);
	}
	throw new Error(`Service readiness timeout: ${container}: ${error}`);
}
try {
	const discovered = await files(target === "sql" ? "packages/sql" : "backend");
	const classified = Object.entries(manifest)
		.filter(([key]) => key.startsWith(`${target}:`))
		.flatMap(([, paths]) => paths);
	assertTestClassification(discovered, classified);
	const selected = Object.entries(manifest).filter(
		([key]) => key.startsWith(`${target}:`) && (category === "all" || key.endsWith(`:${category}`)),
	);
	const env: Record<string, string | undefined> = {
		...process.env,
		ALL_PROXY: "",
		BETTER_AUTH_SECRET: "local-disposable-test-secret-with-32-characters",
		BETTER_AUTH_URL: "http://127.0.0.1:3333",
		HTTP_PROXY: "",
		HTTPS_PROXY: "",
		NO_PROXY: "localhost,127.0.0.1,::1",
		NODE_ENV: "test",
		PUBLIC_WEB_URL: "http://127.0.0.1:5173",
		SERVICE_NAMESPACE: namespace,
	};
	/** Existing servers (global or local .env) are used only through namespaced/ephemeral resources; otherwise start containers. */
	const devUrl = (name: string) => process.env[name]?.trim() || undefined;
	const postgresDevUrl = devUrl("DATABASE_DEV_URL") ?? devUrl("POSTGRES_DEV_URL");
	const redisDevUrl = devUrl("REDIS_DEV_URL");
	const rabbitmqDevUrl = devUrl("RABBITMQ_DEV_URL");
	for (const key of Object.keys(env))
		if (
			/(DATABASE|POSTGRES|REDIS|RABBITMQ|BROKER|SQL|FINANCIAL|CREDIT|RECURRENCE|REFERENCE_RATE|OPEN_FINANCE|CASHBACK).*_(URL|SOCKET)$/.test(
				key,
			)
		)
			delete env[key];
	const databaseKeys = [
		"DATABASE_URL",
		"DATABASE_TEST_URL",
		"PERFORMANCE_DATABASE_URL",
		"HISTORY_SQL_TEST_URL",
		"CASHBACK_SQL_TEST_URL",
		"NORMALIZED_PURCHASE_TEST_URL",
		"RECURRENCE_RUNTIME_TEST_URL",
		"OPEN_FINANCE_TEST_URL",
		"REFERENCE_RATES_TEST_URL",
		"REFERENCE_RATE_REPAIR_TEST_URL",
		"CREDIT_CUTOVER_TEST_URL",
		"CREDIT_BACKFILL_TEST_URL",
		"CARD_PAYMENTS_TEST_URL",
		"RECURRENCE_TEST_URL",
		"FINANCIAL_TEST_URL",
		"DEBT_TEST_URL",
	];
	for (const key of databaseKeys)
		env[key] = "postgresql://runner:disposable@127.0.0.1:1/zaimu_unit_unavailable";
	env.REDIS_URL = env.CACHE_TEST_REDIS_URL = "redis://127.0.0.1:1";
	env.RABBITMQ_URL = env.BROKER_TEST_URL = "amqp://runner:disposable@127.0.0.1:1";
	await command(
		["bun", "run", "export"],
		{ ...env, DO_NOT_TRACK: "1", PRISMA_TELEMETRY_DISABLED: "1" },
		join(root, "packages/sql"),
	);
	let postgres: { container: string; port: string } | undefined;
	let redisUrl = "";
	let brokerUrl = "";
	let brokerContainer = "";
	let unavailableRedis = "";
	if (selected.some(([key, paths]) => !key.endsWith(":unit") && paths.length)) {
		if (!postgresDevUrl || !redisDevUrl || !rabbitmqDevUrl) {
			if (process.env.DOCKER_HOST) assertLocalDockerSocket(process.env.DOCKER_HOST);
			const dockerHost = await command([
				"docker",
				"context",
				"inspect",
				"--format",
				"{{.Endpoints.docker.Host}}",
			]);
			assertLocalDockerSocket(dockerHost);
			await command(["docker", "info"]);
		}
		const checks: Promise<unknown>[] = [];
		if (postgresDevUrl) {
			const admin = new URL(postgresDevUrl);
			admin.pathname = "/postgres";
			externalAdmin = new SQL(admin.toString());
			await externalAdmin`SELECT 1`;
		} else {
			postgres = await service("postgres", "postgres:16", 5432, [
				"POSTGRES_PASSWORD=disposable",
				"POSTGRES_USER=runner",
			]);
			checks.push(ready(postgres.container, ["pg_isready", "-U", "runner"]));
		}
		if (redisDevUrl) {
			externalRedis = new RedisClient(redisDevUrl);
			await externalRedis.send("PING", []);
			redisUrl = redisDevUrl;
		} else {
			const redis = await service("redis", "valkey/valkey:latest", 6379);
			checks.push(ready(redis.container, ["valkey-cli", "ping"]));
			redisUrl = `redis://127.0.0.1:${redis.port}`;
		}
		if (rabbitmqDevUrl) {
			externalBroker = new URL(rabbitmqDevUrl);
			brokerUrl = rabbitmqDevUrl;
		} else {
			const broker = await service("rabbitmq", "rabbitmq:latest", 5672, [
				"RABBITMQ_DEFAULT_USER=runner",
				"RABBITMQ_DEFAULT_PASS=disposable",
				"RABBITMQ_SERVER_ADDITIONAL_ERL_ARGS=+S 2:2",
				"RABBITMQ_CTL_ERL_ARGS=+S 1:1",
			]);
			checks.push(
				ready(broker.container, ["rabbitmq-diagnostics", "-q", "check_running"]),
				ready(broker.container, ["rabbitmq-diagnostics", "-q", "check_port_connectivity"]),
			);
			brokerContainer = broker.container;
			brokerUrl = `amqp://runner:disposable@127.0.0.1:${broker.port}`;
		}
		for (const result of await Promise.allSettled(checks))
			if (result.status === "rejected") throw result.reason;
		const unused = Bun.serve({ fetch: () => new Response(), hostname: "127.0.0.1", port: 0 });
		unavailableRedis = `redis://127.0.0.1:${unused.port}`;
		unused.stop(true);
	}
	let index = 0;
	for (const [key, paths] of selected) {
		const groups = key.endsWith(":unit") ? (paths.length ? [paths] : []) : paths.map(file => [file]);
		for (const group of groups) {
			if (interrupted) throw new Error("Test execution interrupted");
			const suiteEnv = { ...env };
			if (postgres || externalAdmin) {
				const suiteNamespace = `${namespace}_${index}`;
				suiteEnv.SERVICE_NAMESPACE = suiteNamespace;
				const name = `${suiteNamespace}_db`;
				let url: string;
				if (postgres) {
					await command(["docker", "exec", postgres.container, "createdb", "-U", "runner", name]);
					url = `postgresql://runner:disposable@127.0.0.1:${postgres.port}/${name}`;
				} else {
					createdDatabases.push(name);
					await externalAdmin!.unsafe(`CREATE DATABASE "${name}"`);
					const external = new URL(postgresDevUrl!);
					external.pathname = `/${name}`;
					url = external.toString();
				}
				for (const name of databaseKeys) suiteEnv[name] = url;
				suiteEnv.REDIS_URL = suiteEnv.CACHE_TEST_REDIS_URL = redisUrl;
				suiteEnv.RABBITMQ_URL = suiteEnv.BROKER_TEST_URL = brokerUrl;
				suiteEnv.ZAIMU_TEST_RABBITMQ_CONTAINER = brokerContainer;
				suiteEnv.UNAVAILABLE_REDIS_TEST_URL = unavailableRedis;
				suiteEnv.ZAIMU_TEST_FIXTURE = JSON.stringify({
					broker: brokerUrl,
					databases: [url],
					namespace: suiteNamespace,
					redis: redisUrl,
					unavailableRedis,
				});
				if (!key.endsWith(":unit"))
					await prepareSchema(group[0]!, url, suiteEnv, temp, process => {
						if (process) {
							child = process;
							if (interrupted) process.kill("SIGTERM");
						} else child = undefined;
					});
			}
			const report = join(temp, `report-${index++}.xml`);
			const cwd = target === "sql" ? join(root, "packages/sql") : join(root, "backend");
			child = Bun.spawn(
				[
					"bun",
					"test",
					"--preload",
					join(root, "scripts/testing/network.ts"),
					"--timeout=60000",
					"--reporter=junit",
					`--reporter-outfile=${report}`,
					...(args.includes("--coverage") && key.endsWith(":unit") ? ["--coverage"] : []),
					...(args.includes("--changed") ? ["--changed"] : []),
					...group.map(
						file => `./${file.slice((target === "sql" ? "packages/sql/" : "backend/").length)}`,
					),
				],
				{ cwd, env: suiteEnv, stderr: "inherit", stdout: "inherit" },
			);
			const code = await child.exited;
			child = undefined;
			if (code) throw new Error(`Suite ${group.join(", ")} failed (${code})`);
			const xml = await readFile(report, "utf8").catch(() => "");
			// --changed legitimately selects nothing when no test depends on the modified files.
			if (args.includes("--changed") && !/<testcase\b/.test(xml)) continue;
			assertCompleteReport(xml, group.join(", "));
		}
	}
} catch (error) {
	console.error(error);
	process.exitCode = interrupted ? 130 : 1;
} finally {
	await cleanup();
}
