import { monitorEventLoopDelay, PerformanceObserver } from "node:perf_hooks";
import { context, logs, metrics, propagation, trace } from "@opentelemetry/api";
import { AsyncLocalStorageContextManager } from "@opentelemetry/context-async-hooks";
import { W3CTraceContextPropagator } from "@opentelemetry/core";
import { OTLPLogExporter } from "@opentelemetry/exporter-logs-otlp-http";
import { OTLPMetricExporter } from "@opentelemetry/exporter-metrics-otlp-http";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchLogRecordProcessor } from "@opentelemetry/sdk-logs";
import { PeriodicExportingMetricReader } from "@opentelemetry/sdk-metrics";
import { NodeSDK } from "@opentelemetry/sdk-node";
import { AlwaysOnSampler, BatchSpanProcessor } from "@opentelemetry/sdk-trace";
import { getOperationRoute, operation } from "./index";
import { operationalLog } from "./log-record";

let sdk: NodeSDK | undefined;
let restoreConsole: (() => void)[] = [];
export function initialize(service: "api" | "worker", project: string) {
	if (sdk || process.env.OTEL_ENABLED !== "true") return;
	process.env.OTEL_SERVICE_NAME = `${project}-${service}`;
	const base = (process.env.OTEL_EXPORTER_OTLP_ENDPOINT ?? "http://localhost:4318").replace(/\/$/, "");
	const config = { concurrencyLimit: 2, timeoutMillis: 3000 };
	sdk = new NodeSDK({
		autoDetectResources: false,
		contextManager: new AsyncLocalStorageContextManager(),
		logRecordProcessors: [
			new BatchLogRecordProcessor({
				exporter: new OTLPLogExporter({ ...config, url: `${base}/v1/logs` }),
				exportTimeoutMillis: 4000,
				maxExportBatchSize: 256,
				maxQueueSize: 2048,
			}),
		],
		metricReaders: [
			new PeriodicExportingMetricReader({
				exporter: new OTLPMetricExporter({ ...config, url: `${base}/v1/metrics` }),
				exportIntervalMillis: 15000,
				exportTimeoutMillis: 4000,
			}),
		],
		resource: resourceFromAttributes({
			"deployment.environment.name": process.env.NODE_ENV ?? "development",
			"service.instance.id": crypto.randomUUID(),
			"service.name": process.env.OTEL_SERVICE_NAME,
			"service.namespace": project,
			"service.version": process.env.OTEL_SERVICE_VERSION ?? "development",
		}),
		sampler: new AlwaysOnSampler(),
		spanProcessors: [
			new BatchSpanProcessor({
				exporter: new OTLPTraceExporter({ ...config, url: `${base}/v1/traces` }),
				exportTimeoutMillis: 4000,
				maxExportBatchSize: 256,
				maxQueueSize: 2048,
				scheduledDelayMillis: 1000,
			}),
		],
		textMapPropagator: new W3CTraceContextPropagator(),
	});
	sdk.start();
	const originalFetch = globalThis.fetch;
	globalThis.fetch = Object.assign((input: Parameters<typeof fetch>[0], init?: RequestInit) => {
		const url = input instanceof Request ? input.url : String(input);
		if (url.startsWith(base)) return originalFetch(input, init);
		return operation("http.client", () => {
			const headers = new Headers(
				init?.headers ?? (input instanceof Request ? input.headers : undefined),
			);
			const carrier: Record<string, string> = {};
			propagation.inject(context.active(), carrier);
			for (const [key, value] of Object.entries(carrier)) headers.set(key, value);
			return originalFetch(input, { ...init, headers });
		});
	}, originalFetch);
	if (typeof originalFetch.preconnect === "function")
		globalThis.fetch.preconnect = originalFetch.preconnect.bind(originalFetch);
	restoreConsole.push(() => {
		globalThis.fetch = originalFetch;
	});
	const logger = logs.getLogger("application");
	const meter = metrics.getMeter("runtime");
	if (PerformanceObserver.supportedEntryTypes.includes("gc")) {
		const gc = new PerformanceObserver(list => {
			for (const entry of list.getEntries())
				meter.createHistogram("runtime.gc.duration", { unit: "s" }).record(entry.duration / 1000);
		});
		gc.observe({ entryTypes: ["gc"] });
		restoreConsole.push(() => gc.disconnect());
	}
	const lag = monitorEventLoopDelay({ resolution: 20 });
	lag.enable();
	restoreConsole.push(() => lag.disable());
	meter.createObservableGauge("runtime.event_loop.delay", { unit: "s" }).addCallback(observer => {
		const p95 = lag.percentile(95) / 1e9;
		if (Number.isFinite(p95)) observer.observe(p95);
		lag.reset();
	});
	meter.createObservableGauge("process.memory.usage", { unit: "By" }).addCallback(observer => {
		const memory = process.memoryUsage();
		observer.observe(memory.rss, { type: "rss" });
		observer.observe(memory.heapUsed, { type: "heap" });
	});
	meter.createObservableCounter("process.cpu.time", { unit: "s" }).addCallback(observer => {
		const cpu = process.cpuUsage();
		observer.observe(cpu.user / 1e6, { mode: "user" });
		observer.observe(cpu.system / 1e6, { mode: "system" });
	});
	// Console remains the single local emission. Export the same structured records.
	for (const [method, severityNumber] of [
		["debug", 5],
		["info", 9],
		["log", 9],
		["warn", 13],
		["error", 17],
	] as const) {
		const original = console[method].bind(console);
		restoreConsole.push(() => {
			console[method] = original;
		});
		console[method] = (...args: unknown[]) => {
			// Raw operational messages/errors can contain private data. Export structure only.
			if (
				severityNumber >=
				({ debug: 5, error: 17, info: 9, warn: 13 }[
					process.env.OTEL_LOG_LEVEL as "debug" | "info" | "warn" | "error"
				] ?? 9)
			) {
				const record = operationalLog(args);
				const fields = {
					...record.fields,
					...(record.body === "http_request" ? { route: getOperationRoute() ?? "unmatched" } : {}),
				};
				logger.emit({
					attributes: { ...record.attributes, "log.performance": JSON.stringify(fields) },
					body: record.body,
					severityNumber,
				});
				const active = trace.getSpan(context.active())?.spanContext();
				original(
					JSON.stringify({
						body: record.body,
						environment: process.env.NODE_ENV ?? "development",
						operation_id: active?.traceId,
						service: process.env.OTEL_SERVICE_NAME,
						severity: method === "log" ? "info" : method,
						span_id: active?.spanId,
						...fields,
						timestamp: new Date().toISOString(),
						trace_id: active?.traceId,
						...record.attributes,
					}),
				);
			}
		};
	}
}
export async function shutdown() {
	const active = sdk;
	sdk = undefined;
	for (const restore of restoreConsole) restore();
	restoreConsole = [];
	if (!active) return;
	let timer: ReturnType<typeof setTimeout> | undefined;
	try {
		await Promise.race([
			active.shutdown().catch(() => undefined),
			new Promise<void>(resolve => {
				timer = setTimeout(resolve, 5000);
			}),
		]);
	} finally {
		if (timer) clearTimeout(timer);
	}
}
