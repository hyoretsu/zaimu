import { SpanStatusCode } from "@opentelemetry/api";
import { OTLPTraceExporter } from "@opentelemetry/exporter-trace-otlp-http";
import { resourceFromAttributes } from "@opentelemetry/resources";
import { BatchSpanProcessor, type SpanExporter, TracerProvider } from "@opentelemetry/sdk-trace";
import { onCLS, onFCP, onINP, onLCP, onTTFB } from "web-vitals";
export function initializeBrowser(config: {
	enabled: boolean;
	endpoint: string;
	apiOrigin: string;
	project: string;
	version: string;
	tauri: boolean;
}) {
	if (!config.enabled) return { navigation: () => {}, navigationStart: () => {} };
	const endpoint = new URL(config.endpoint, window.location.href);
	const provider = new TracerProvider({
		resource: resourceFromAttributes({
			"service.name": `${config.project}-${config.tauri ? "tauri" : "web"}`,
			"service.version": config.version,
		}),
		spanProcessors: [
			new BatchSpanProcessor({
				exporter: new OTLPTraceExporter({ timeoutMillis: 3000, url: endpoint.href }) as SpanExporter,
				exportTimeoutMillis: 4000,
				maxExportBatchSize: 16,
				maxQueueSize: 128,
				scheduledDelayMillis: 5000,
			}),
		],
	});
	const tracer = provider.getTracer("client");
	const originalFetch = globalThis.fetch.bind(globalThis);
	globalThis.fetch = Object.assign(async (input: RequestInfo | URL, init?: RequestInit) => {
		const url = new URL(input instanceof Request ? input.url : String(input), window.location.href);
		if (url.origin !== config.apiOrigin || url.href.startsWith(endpoint.href))
			return originalFetch(input, init);
		const span = tracer.startSpan("client.fetch");
		const headers = new Headers(init?.headers ?? (input instanceof Request ? input.headers : undefined));
		const context = span.spanContext();
		headers.set("traceparent", `00-${context.traceId}-${context.spanId}-01`);
		try {
			const response = await originalFetch(input, { ...init, headers });
			if (response.status >= 500) span.setStatus({ code: SpanStatusCode.ERROR });
			return response;
		} catch (error) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			throw error;
		} finally {
			span.end();
		}
	}, globalThis.fetch);
	const signal = (name: string) => {
		const span = tracer.startSpan(name);
		if (name === "client.error") span.setStatus({ code: SpanStatusCode.ERROR });
		span.end();
	};
	window.addEventListener("error", () => signal("client.error"));
	window.addEventListener("unhandledrejection", () => signal("client.error"));
	window.addEventListener("pagehide", () => {
		void provider.forceFlush().catch(() => {});
	});
	const vital = (metric: { name: string; value: number }) => {
		const span = tracer.startSpan("client.vital");
		span.setAttributes({ "client.vital.name": metric.name, "client.vital.value": metric.value });
		span.end();
	};
	for (const observe of [onCLS, onINP, onLCP, onFCP, onTTFB]) observe(vital);
	let navigationStarted = performance.timeOrigin;
	return {
		navigation: () => {
			const span = tracer.startSpan("client.navigation", { startTime: navigationStarted });
			span.end();
			navigationStarted = Date.now();
		},
		navigationStart: () => {
			navigationStarted = Date.now();
		},
	};
}
