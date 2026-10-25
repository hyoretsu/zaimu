import amqp from "amqplib";
import { RedisClient } from "bun";
import { config } from "dotenv";
import pg from "pg";

// Run from backend so Bun loads the same environment as the API and worker.
const timeoutMs = 5000;
const frontendEnv: Record<string, string> = {};
config({ path: ["../frontend/.env.local", "../frontend/.env"], processEnv: frontendEnv, quiet: true });

async function http(url: string) {
	const response = await fetch(url, { redirect: "error", signal: AbortSignal.timeout(timeoutMs) });
	await response.body?.cancel();
	if (!response.ok) throw new Error("Unexpected HTTP status");
}

const checks: Record<string, () => Promise<unknown>> = {
	api: () => http(`http://127.0.0.1:${process.env.PORT || 3333}/health`),
	frontend: () => http(`http://127.0.0.1:${frontendEnv.PORT || 5173}/`),
	postgres: async () => {
		if (!process.env.DATABASE_URL) throw new Error("DATABASE_URL is required");
		const client = new pg.Client({
			connectionString: process.env.DATABASE_URL,
			connectionTimeoutMillis: timeoutMs,
			query_timeout: timeoutMs,
			statement_timeout: timeoutMs,
		});
		try {
			await client.connect();
			await client.query("SELECT 1");
		} finally {
			await client.end();
		}
	},
	rabbitmq: async () => {
		const connection = await amqp.connect(process.env.RABBITMQ_URL ?? "amqp://localhost:5672", {
			timeout: timeoutMs,
		});
		connection.on("error", () => {});
		await connection.close();
	},
	redis: async () => {
		if (!process.env.REDIS_URL) throw new Error("REDIS_URL is required");
		const client = new RedisClient(process.env.REDIS_URL, {
			autoReconnect: false,
			connectionTimeout: timeoutMs,
		});
		try {
			await client.connect();
			if ((await client.send("PING", [])) !== "PONG") throw new Error("Unexpected Redis response");
		} finally {
			client.close();
		}
	},
};

// Bound the whole probe, including protocol handshakes and resource cleanup.
const results: Record<string, string> = {};
const deadline = setTimeout(() => {
	for (const name of Object.keys(checks)) results[name] ??= "timeout";
	console.log(JSON.stringify(results));
	process.exit(1);
}, timeoutMs + 1000);

await Promise.all(
	Object.entries(checks).map(async ([name, check]) => {
		try {
			await check();
			results[name] = "ok";
		} catch {
			// Driver errors can contain credentials or connection URLs.
			results[name] = "failed";
		}
	}),
);
clearTimeout(deadline);
console.log(JSON.stringify(results));
process.exit(Object.values(results).every(status => status === "ok") ? 0 : 1);
