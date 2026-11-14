import { afterAll, beforeAll, expect, test } from "bun:test";
import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { operation } from "@zaimu/observability";
import { instrumentRequest, setHttpRoute } from "@zaimu/observability/http";
import { Client } from "pg";
import { closeDatabase, queryRaw, withRawTransaction } from "sql";
import contract from "../../../../../../packages/sql/out/prisma/contract.json";
import { installContractFixture } from "../../../../../../packages/sql/tests/contract-fixture";
import { requireFixtureUrl } from "../../../../../../scripts/testing/fixture";
import { createEventEnvelope } from "../../../application/events";
import { RabbitMqBroker } from "../../broker/RabbitMqBroker";
import { RedisCache } from "../../cache/RedisCache";
import { OutboxPublisher } from "../../outbox/OutboxPublisher";
import { PostgresOutbox } from "../../outbox/PostgresOutbox";
import { cacheKey } from "../../service-namespace";
const exporter = new InMemorySpanExporter();
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
propagation.setGlobalPropagator(new W3CTraceContextPropagator());
trace.setGlobalTracerProvider(
	new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] }),
);
const broker = new RabbitMqBroker(requireFixtureUrl("BROKER_TEST_URL"));
const redis = new RedisCache(requireFixtureUrl("CACHE_TEST_REDIS_URL"));
beforeAll(async () => {
	const client = new Client({ connectionString: requireFixtureUrl("DATABASE_TEST_URL") });
	await client.connect();
	try {
		await installContractFixture(client, contract);
	} finally {
		await client.end();
	}
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
});
afterAll(async () => {
	await broker.close();
	redis.client.close();
	await closeDatabase();
});
test("HTTP to SQL/Redis and durable outbox to worker retain correlation after publisher restart", async () => {
	let consumed = false;
	let attempts = 0;
	await broker.consume("schedule-materialization", async () => {
		attempts++;
		if (attempts === 1) throw Error("synthetic retry");
		await queryRaw("SELECT 1 AS count");
		await redis.set(cacheKey("otel-fixture-worker"), "done", { ttlMs: 60000 });
		consumed = true;
	});
	const eventId = crypto.randomUUID();
	const handle = instrumentRequest(() =>
		operation("fixture.handler", async () => {
			setHttpRoute("/fixture/:id");
			await withRawTransaction(async query => {
				await query("SELECT 1 AS count");
				await redis.set(cacheKey("otel-fixture-request"), "ready", { ttlMs: 60000 });
				await new PostgresOutbox().append(
					createEventEnvelope({
						aggregateId: crypto.randomUUID(),
						aggregateType: "fixture",
						correlationId: crypto.randomUUID(),
						eventId,
						eventType: "command.schedule-materialization",
						payload: { technical: true },
						userIds: [],
					}),
				);
			});
			return Response.json({ status: "queued" });
		}),
	);
	const server = Bun.serve({ fetch: handle, hostname: "127.0.0.1", port: 0 });
	try {
		const response = await fetch(new URL("/fixture/private-id", server.url), {
			headers: { traceparent: `00-${"1".repeat(32)}-${"2".repeat(16)}-01` },
		});
		expect(response.status).toBe(200);
		await response.text();
	} finally {
		await server.stop(true);
	}

	const persisted = await queryRaw<{ payload: unknown; telemetryContext: { traceparent: string } }>(
		'SELECT payload,"telemetryContext" FROM "OutboxEvent" WHERE id=$1',
		[eventId],
	);
	expect(persisted[0]!.payload).toEqual({ technical: true });
	expect(persisted[0]!.telemetryContext.traceparent).toContain("1".repeat(32));
	// A fresh publisher reads the context from storage, rather than process-local state.
	const pending = await new PostgresOutbox().claim(1, 1);
	expect(pending).toHaveLength(1);
	expect(Array.isArray(pending[0]!.userIds)).toBe(true);
	expect(Number.isInteger(pending[0]!.schemaVersion)).toBe(true);
	expect(pending[0]!.occurredAt).toMatch(/^20/);
	await new PostgresOutbox().release(eventId, "synthetic publisher restart");
	await new OutboxPublisher(broker).publishBatch();
	const deadline = Date.now() + 45000;
	while (!consumed && Date.now() < deadline) await Bun.sleep(100);
	expect(consumed).toBe(true);
	expect(attempts).toBe(2);
	const spans = exporter.getFinishedSpans();
	expect(spans.some(span => span.attributes["db.collection.name"] === "OutboxEvent")).toBe(true);
	expect(spans.some(span => span.attributes["db.response.returned_rows"] === 1)).toBe(true);
	expect(
		spans.some(span => span.name === "db.SELECT" && span.spanContext().traceId === "1".repeat(32)),
	).toBe(true);
	expect(
		spans.some(span => span.name.startsWith("redis.") && span.spanContext().traceId === "1".repeat(32)),
	).toBe(true);
	expect(
		spans.some(
			span =>
				span.name === "messaging.process" &&
				span.links.some(link => link.context.traceId === "1".repeat(32)),
		),
	).toBe(true);
	const failed = spans.find(span => span.name === "messaging.process" && span.status.code === 2);
	expect(failed?.links.some(link => link.context.traceId === "1".repeat(32))).toBe(true);
	expect(
		spans.some(
			span =>
				span.name === "messaging.retry" &&
				span.spanContext().traceId === failed?.spanContext().traceId,
		),
	).toBe(true);
	expect(JSON.stringify(spans.map(span => span.attributes))).not.toContain("private-id");
}, 180000);
