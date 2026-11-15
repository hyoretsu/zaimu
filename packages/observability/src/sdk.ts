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
import { getOperationRoute, markCurrentOperationFailed, operation, otlpEndpoint } from "./index";
import { operationalLog } from "./log-record";
import { installPrettyConsole, prettyRecord } from "./pretty";

let sdk: NodeSDK | undefined;
const prettyArgs = (args: unknown[], method: "error") => {
	const line = prettyRecord(args, method, process.env.OTEL_SERVICE_NAME);
	return line === undefined ? args : [line];
};
let restoreConsole: (() => void)[] = [];
export function initialize(service: "api" | "worker", project: string) {
	const base = otlpEndpoint();
	process.env.OTEL_SERVICE_NAME = `${project}-${service}`;
	if (!base) {
		if (!sdk && process.env.NODE_ENV !== "production")
			installPrettyConsole(process.env.OTEL_SERVICE_NAME);
		return;
	}
	if (sdk) return;
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
			"service.version": process.env.NODE_ENV ?? "development",
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
		return operation("http.client", async () => {
			const headers = new Headers(
				init?.headers ?? (input instanceof Request ? input.headers : undefined),
			);
			const carrier: Record<string, string> = {};
			propagation.inject(context.active(), carrier);
			for (const [key, value] of Object.entries(carrier)) headers.set(key, value);
			const response = await originalFetch(input, { ...init, headers });
			trace.getSpan(context.active())?.setAttribute("http.response.status_code", response.status);
			if (response.status >= 500) markCurrentOperationFailed();
			return response;
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
	// Export structured console records; the console itself only keeps errors while exporting.
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
				// Exported records are not echoed locally; errors keep their original local detail
				// (message and stack never reach the Collector, only this process console).
				if (method !== "error") return;
				original(...(process.env.NODE_ENV === "production" ? args : prettyArgs(args, method)));
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
