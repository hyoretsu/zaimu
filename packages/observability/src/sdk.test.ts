import { expect, test } from "bun:test";
test("collector outage cannot fail application work or keep shutdown open", () => {
	const child = Bun.spawnSync(
		[
			process.execPath,
			"--eval",
			`import {initialize,shutdown} from ${JSON.stringify(import.meta.resolve("./sdk"))};import {operation} from ${JSON.stringify(import.meta.resolve("./index"))};console.log("sdk.loaded");initialize("api","fixture");console.log("sdk.initialized");if(await operation("fixture",async()=>42)!==42)process.exit(2);const started=performance.now();await shutdown();console.log(JSON.stringify({shutdownMs:performance.now()-started}));`,
		],
		{
			env: {
				...process.env,
				OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1",
				OTEL_LOG_LEVEL: "error",
			},
			stderr: "pipe",
			stdout: "pipe",
			timeout: 120000,
		},
	);
	expect({
		code: child.exitCode,
		errors: child.stderr.toString(),
		output: child.stdout.toString(),
	}).toMatchObject({ code: 0 });
	const result = JSON.parse(child.stdout.toString().trim().split("\n").at(-1)!);
	expect(result.shutdownMs).toBeLessThan(6000);
}, 125000);

test("HTTP dependency failures retain responses and do not fail a recovered parent", () => {
	const script = `
import { context, trace } from ${JSON.stringify(import.meta.resolve("@opentelemetry/api"))};
import { InMemorySpanExporter, SimpleSpanProcessor, TracerProvider } from ${JSON.stringify(import.meta.resolve("@opentelemetry/sdk-trace"))};
import { mock } from "bun:test";
import { NodeSDK } from ${JSON.stringify(import.meta.resolve("@opentelemetry/sdk-node"))};
import { operation } from ${JSON.stringify(import.meta.resolve("./index"))};
const exporter = new InMemorySpanExporter();
mock.module(${JSON.stringify(import.meta.resolve("@opentelemetry/sdk-node"))},()=>({NodeSDK:class extends NodeSDK {constructor(options){super({...options,spanProcessors:[new SimpleSpanProcessor({exporter})]});}}}));
const {initialize,shutdown}=await import(${JSON.stringify(import.meta.resolve("./sdk"))});
const responses = [new Response("unavailable",{status:503}), new Response("recovered",{status:200})];
const parents = [];
let calls = 0;
globalThis.fetch = Object.assign(async (_input,init) => {parents.push(new Headers(init.headers).get("traceparent"));return responses[calls++];},globalThis.fetch);
initialize("api","fixture");
const result = await operation("recovered.parent",async()=>{
 const failed = await fetch("https://dependency.invalid/fixture");
 const recovered = await fetch("https://dependency.invalid/fixture");
 return {same:failed===responses[0]&&recovered===responses[1],bodies:[await failed.text(),await recovered.text()]};
});

const spans = exporter.getFinishedSpans().map(span=>({name:span.name,status:span.status.code,outcome:span.attributes["code.outcome"],httpStatus:span.attributes["http.response.status_code"],traceId:span.spanContext().traceId,spanId:span.spanContext().spanId,parent:span.parentSpanContext?.spanId}));
await shutdown();

process.stdout.write(JSON.stringify({result,spans,parents})+"\\n");`;
	const child = Bun.spawnSync([process.execPath, "--eval", script], {
		env: {
			...process.env,
			OTEL_EXPORTER_OTLP_ENDPOINT: "http://127.0.0.1:1",
			OTEL_LOG_LEVEL: "error",
		},
		stderr: "pipe",
		stdout: "pipe",
		timeout: 120000,
	});
	expect({ code: child.exitCode, errors: child.stderr.toString() }).toMatchObject({ code: 0 });
	const output = JSON.parse(child.stdout.toString().trim().split("\n").at(-1)!);
	expect(output.result).toEqual({ bodies: ["unavailable", "recovered"], same: true });
	const parent = output.spans.find((span: { name: string }) => span.name === "recovered.parent");
	const dependencies = output.spans.filter((span: { name: string }) => span.name === "http.client");
	expect(parent).toMatchObject({ outcome: "ok", status: 0 });
	expect(dependencies).toHaveLength(2);
	expect(dependencies[0]).toMatchObject({
		httpStatus: 503,
		outcome: "error",
		parent: parent.spanId,
		status: 2,
		traceId: parent.traceId,
	});
	expect(dependencies[1]).toMatchObject({
		httpStatus: 200,
		outcome: "ok",
		parent: parent.spanId,
		status: 0,
		traceId: parent.traceId,
	});
	expect(output.parents).toEqual(
		dependencies.map(
			(span: { traceId: string; spanId: string }) => `00-${span.traceId}-${span.spanId}-01`,
		),
	);
}, 125000);
