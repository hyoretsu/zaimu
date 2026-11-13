import { expect, test } from "bun:test";
import { context, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from "@opentelemetry/sdk-trace";
import { instrumentRequest } from "./http";
import { markOperationFailed, operation } from "./index";

const exporter = new InMemorySpanExporter();
const provider = new TracerProvider({ spanProcessors: [new SimpleSpanProcessor({ exporter })] });
context.setGlobalContextManager(new AsyncLocalStorageContextManager().enable());
trace.setGlobalTracerProvider(provider);
propagation.setGlobalPropagator(new W3CTraceContextPropagator());
process.env.OTEL_ENABLED = "true";
test("concurrent operations retain separate parents", async () => {
	const ids = await Promise.all(
		[1, 2].map(index =>
			operation(`root${index}`, async () => {
				const root = trace.getSpan(context.active())!.spanContext().traceId;
				await new Promise(resolve => setTimeout(resolve, index));
				return operation("child", () => ({
					child: trace.getSpan(context.active())!.spanContext().traceId,
					root,
				}));
			}),
		),
	);
	expect(ids[0]!.root).not.toBe(ids[1]!.root);
	for (const item of ids) expect(item.root).toBe(item.child);
});
test("stream spans end after consumption and cancellation", async () => {
	const count = exporter.getFinishedSpans().length;
	const handle = instrumentRequest(() => new Response("fixture"));
	const response = await handle(new Request("http://localhost/"));
	expect(exporter.getFinishedSpans().length).toBe(count);
	await response.text();
	expect(exporter.getFinishedSpans().length).toBe(count + 1);
	const cancelled = await handle(new Request("http://localhost/"));
	await cancelled.body!.cancel();
	expect(exporter.getFinishedSpans().length).toBe(count + 2);
});
test("depth limit marks root and preserves recursion result", () => {
	function recurse(n: number): number {
		return operation("recursive", () => (n ? recurse(n - 1) + 1 : 0));
	}
	expect(recurse(40)).toBe(40);
	expect(exporter.getFinishedSpans().at(-1)!.attributes["application.truncated"]).toBe(true);
});

test("durable operations link to origin without extending its lifetime", async () => {
	const { captureContext, linkedOperation } = await import("./index");
	const carrier = operation("origin", () => captureContext());
	linkedOperation("consumer", carrier, () => 42);
	const spans = exporter.getFinishedSpans();
	const origin = spans.find(span => span.name === "origin")!;
	const consumer = spans.find(span => span.name === "consumer")!;
	expect(consumer.spanContext().traceId).not.toBe(origin.spanContext().traceId);
	expect(consumer.links[0]!.context.traceId).toBe(origin.spanContext().traceId);
});

test("sync promise returns retain native unhandled-rejection behavior", async () => {
	const script = `import {functionCall} from ${JSON.stringify(new URL("./index.ts", import.meta.url).pathname)};
 process.env.OTEL_ENABLED="true";
 process.on("unhandledRejection",()=>{console.log("unhandled");clearTimeout(deadline);});
 functionCall("fixture","fixture.ts",[],()=>Promise.reject(new Error("fixture")),false);
 const deadline=setTimeout(()=>process.exit(1),1000);`;
	const child = Bun.spawn([process.execPath, "-e", script], { stderr: "pipe", stdout: "pipe" });
	expect(await child.exited).toBe(0);
	expect((await new Response(child.stdout).text()).trim()).toBe("unhandled");
}, 30000);

test("sibling function calls share the HTTP operation's span budget", async () => {
	const before = exporter.getFinishedSpans().length;
	let calls = 0;
	const response = await instrumentRequest(() => {
		for (let index = 0; index < 1100; index++) operation("sibling", () => calls++);
		return new Response(null);
	})(new Request("http://localhost/budget"));
	expect(response.status).toBe(200);
	expect(calls).toBe(1100);
	const spans = exporter.getFinishedSpans().slice(before);
	expect(spans.filter(span => span.name === "sibling")).toHaveLength(1000);
	expect(spans.at(-1)!.attributes["application.truncated"]).toBe(true);
});

test("handled worker failures mark the root without changing business results", async () => {
	const result = { result: "failed_retry" };
	expect(
		await operation("handled-retry", async () => {
			operation("receipt", () => markOperationFailed());
			return result;
		}),
	).toBe(result);
	const root = exporter.getFinishedSpans().find(span => span.name === "handled-retry")!;
	expect(root.status.code).toBe(2);
	expect(root.attributes["code.outcome"]).toBe("error");
});

test("untrusted vendor state cannot escape through HTTP spans or durable links", async () => {
	const { linkedOperation } = await import("./index");
	const traceId = "11111111111111111111111111111111";
	const carrier = {
		traceparent: `00-${traceId}-2222222222222222-01`,
		tracestate: "vendor=private-secret-fixture",
	};
	const start = exporter.getFinishedSpans().length;
	const response = await instrumentRequest(() => {
		linkedOperation("private.link", carrier, () => 42);
		return new Response(null);
	})(new Request("http://localhost/privacy", { headers: carrier }));
	expect(response.status).toBe(200);
	const spans = exporter.getFinishedSpans().slice(start);
	const root = spans.find(span => span.name !== "private.link")!;
	const linked = spans.find(span => span.name === "private.link")!;
	expect(root.spanContext().traceId).toBe(traceId);
	expect(root.spanContext().traceState?.serialize()).toBeUndefined();
	expect(linked.links[0]!.context.traceId).toBe(traceId);
	expect(linked.links[0]!.context.traceState?.serialize()).toBeUndefined();
});

test("argument inspection is skipped when disabled or span budget is exhausted", async () => {
	const { functionCall } = await import("./index");
	const previous = {
		capture: process.env.OTEL_CAPTURE_SUMMARIES,
		enabled: process.env.OTEL_ENABLED,
		limit: process.env.OTEL_FUNCTION_MAX_SPANS,
	};
	let inspected = 0;
	const args = new Proxy(
		{},
		{
			getOwnPropertyDescriptor() {
				inspected++;
				return undefined;
			},
			ownKeys() {
				inspected++;
				return [];
			},
		},
	);
	try {
		process.env.OTEL_CAPTURE_SUMMARIES = "true";
		process.env.OTEL_ENABLED = "false";
		expect(functionCall("off", "fixture.ts", args, () => 42)).toBe(42);
		process.env.OTEL_ENABLED = "true";
		process.env.OTEL_FUNCTION_MAX_SPANS = "1";
		expect(operation("bounded", () => functionCall("limited", "fixture.ts", args, () => 7))).toBe(7);
		expect(inspected).toBe(0);
	} finally {
		for (const [key, value] of Object.entries({
			OTEL_CAPTURE_SUMMARIES: previous.capture,
			OTEL_ENABLED: previous.enabled,
			OTEL_FUNCTION_MAX_SPANS: previous.limit,
		})) {
			if (value === undefined) delete process.env[key];
			else process.env[key] = value;
		}
	}
});
