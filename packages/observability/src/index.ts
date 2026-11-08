import { AsyncLocalStorage } from "node:async_hooks";
import {
	type Attributes,
	type Context,
	context,
	type Link,
	metrics,
	propagation,
	ROOT_CONTEXT,
	type Span,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import { summarize } from "./sanitize";

export { summarize } from "./sanitize";

const suppressed = new AsyncLocalStorage<boolean>();
export const withoutObservability = <T>(work: () => T): T => suppressed.run(true, work);
const state = new AsyncLocalStorage<{ depth: number; budget: { count: number }; root: Span }>();
const tracer = trace.getTracer("application");
let instruments:
	| {
			duration: ReturnType<ReturnType<typeof metrics.getMeter>["createHistogram"]>;
			errors: ReturnType<ReturnType<typeof metrics.getMeter>["createCounter"]>;
	  }
	| undefined;
function getInstruments() {
	if (!instruments) {
		const meter = metrics.getMeter("application");
		instruments = {
			duration: meter.createHistogram("application.operation.duration", {
				advice: {
					explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
				},
				unit: "s",
			}),
			errors: meter.createCounter("application.operation.errors"),
		};
	}
	return instruments;
}
export const getOperationRoot = () => state.getStore()?.root;
const failedOperations = new WeakSet<Span>();
export function markOperationFailed() {
	const span = getOperationRoot() ?? trace.getSpan(context.active());
	if (span) {
		failedOperations.add(span);
		span.setStatus({ code: SpanStatusCode.ERROR });
	}
}
/** Mark a handled dependency failure without failing the enclosing operation. */
export function markCurrentOperationFailed() {
	const span = trace.getSpan(context.active());
	if (span) {
		failedOperations.add(span);
		span.setStatus({ code: SpanStatusCode.ERROR });
	}
}
const operationRoutes = new WeakMap<object, string>();
export function setOperationRoute(span: Span, route: string) {
	operationRoutes.set(span, route);
}
export function getOperationRoute() {
	const root = getOperationRoot();
	return root ? operationRoutes.get(root) : undefined;
}
export function bindOperationContext(span: Span) {
	const scope = { budget: { count: 0 }, depth: 0, root: span };
	return <T>(work: () => T): T => state.run(scope, work);
}
export const enabled = () => process.env.OTEL_ENABLED === "true" && !suppressed.getStore();
export function captureContext(): Record<string, string> {
	const carrier: Record<string, string> = {};
	propagation.inject(context.active(), carrier);
	// Never persist baggage or arbitrary headers in the outbox.
	return carrier.traceparent ? { traceparent: carrier.traceparent } : {};
}
export function linkedContext(carrier: Record<string, string> | undefined) {
	const extracted = propagation.extract(ROOT_CONTEXT, carrier ?? {});
	const linked = trace.getSpanContext(extracted);
	return linked ? [{ context: linked }] : [];
}
export function operation<T>(
	name: string,
	work: () => T,
	attributes: Attributes = {},
	parent: Context = context.active(),
	links: Link[] = [],
	observeSettlement = true,
): T {
	if (!enabled()) return work();
	const current = state.getStore();
	const depth = current?.depth ?? 0;
	const budget = current?.budget ?? { count: 0 };
	if (
		depth >= Math.min(32, Number(process.env.OTEL_FUNCTION_MAX_DEPTH) || 32) ||
		budget.count >= Math.min(1000, Number(process.env.OTEL_FUNCTION_MAX_SPANS) || 1000)
	) {
		current?.root.setAttribute("application.truncated", true);
		return work();
	}
	budget.count++;
	const started = performance.now();
	return tracer.startActiveSpan(name, { attributes, links }, parent, span =>
		state.run({ budget, depth: depth + 1, root: current?.root ?? span }, () => {
			let ended = false;
			const finish = (error = false) => {
				if (ended) return;
				error ||= failedOperations.has(span);
				ended = true;
				span.setAttribute("code.outcome", error ? "error" : "ok");
				if (error) {
					span.setStatus({ code: SpanStatusCode.ERROR });
					span.addEvent("exception", { "exception.type": "Error" });
					getInstruments().errors.add(1, { operation: name });
				}
				getInstruments().duration.record((performance.now() - started) / 1000, {
					operation: name,
					outcome: error ? "error" : "ok",
				});
				span.end();
			};
			try {
				const result = work();
				if (result instanceof Promise && observeSettlement) {
					// Observe settlement without replacing the original promise or its identity.
					result.then(
						value => {
							if (process.env.OTEL_CAPTURE_SUMMARIES === "true")
								span.setAttribute("code.return", summarize(value));
							finish();
						},
						() => finish(true),
					);
				} else {
					if (process.env.OTEL_CAPTURE_SUMMARIES === "true")
						span.setAttribute("code.return", summarize(result));
					finish();
				}
				return result;
			} catch (error) {
				finish(true);
				throw error;
			}
		}),
	);
}
export function functionCall<T>(
	name: string,
	location: string,
	args: unknown,
	work: () => T,
	asynchronous = false,
): T {
	return operation(
		name,
		work,
		{
			"code.file.path": location,
			...(process.env.OTEL_CAPTURE_SUMMARIES === "true" ? { "code.arguments": summarize(args) } : {}),
		},
		context.active(),
		[],
		asynchronous,
	);
}
export function log(level: "debug" | "info" | "warn" | "error", event: string, fields?: unknown) {
	const levels = { debug: 5, error: 17, info: 9, warn: 13 };
	if (levels[level] < (levels[process.env.OTEL_LOG_LEVEL as keyof typeof levels] ?? 9)) return;
	const active = trace.getSpan(context.active())?.spanContext();
	console[level](
		JSON.stringify({
			environment: process.env.NODE_ENV ?? "development",
			event,
			service: process.env.OTEL_SERVICE_NAME,
			severity: level,
			span_id: active?.spanId,
			summary: summarize(fields),
			timestamp: new Date().toISOString(),
			trace_id: active?.traceId,
		}),
	);
}

/** Passive dependency span: no SQL, keys, parameters or result values. */
export function startDependency(name: string, location?: string, attributes: Attributes = {}) {
	if (!enabled()) return (_failed = false, _attributes?: Attributes) => {};
	const current = state.getStore();
	if (location && current) {
		if (
			current.budget.count >= Math.min(1000, Number(process.env.OTEL_FUNCTION_MAX_SPANS) || 1000) ||
			current.depth >= Math.min(32, Number(process.env.OTEL_FUNCTION_MAX_DEPTH) || 32)
		) {
			current.root.setAttribute("application.truncated", true);
			return (_failed = false, _attributes?: Attributes) => {};
		}
		current.budget.count++;
	}
	const span = tracer.startSpan(name, {
		attributes: { ...attributes, ...(location ? { "code.file.path": location } : {}) },
	});
	const started = performance.now();
	let finished = false;
	return (failed = false, resultAttributes?: Attributes) => {
		if (finished) return;
		finished = true;
		if (resultAttributes) span.setAttributes(resultAttributes);
		span.setAttribute("code.outcome", failed ? "error" : "ok");
		if (failed) {
			span.setStatus({ code: SpanStatusCode.ERROR });
			span.addEvent("exception", { "exception.type": "Error" });
		}
		getInstruments().duration.record((performance.now() - started) / 1000, {
			operation: name,
			outcome: failed ? "error" : "ok",
		});
		if (failed) getInstruments().errors.add(1, { operation: name });
		span.end();
	};
}

export function linkedOperation<T>(
	name: string,
	carrier: Record<string, string> | undefined,
	work: () => T,
): T {
	return state.exit(() => operation(name, work, {}, ROOT_CONTEXT, linkedContext(carrier)));
}

export function recordJob(queue: string, lagMs: number | null, outcome: string) {
	if (!enabled()) return;
	const meter = metrics.getMeter("worker");
	meter.createCounter("worker.jobs").add(1, { outcome: outcome === "ok" ? "ok" : "error", queue });
	if (lagMs !== null)
		meter
			.createHistogram("worker.queue.delay", {
				advice: {
					explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10],
				},
				unit: "s",
			})
			.record(lagMs / 1000, { queue });
}
export function recordDelivery(queue: string, result: string) {
	if (!enabled()) return;
	const allowed = ["busy", "completed", "duplicate", "failed_dlq", "failed_retry", "invalid_dlq"];
	metrics
		.getMeter("worker")
		.createCounter("worker.deliveries")
		.add(1, { queue, result: allowed.includes(result) ? result : "unknown" });
}
export function recordOutboxBacklog(count: number) {
	if (enabled()) metrics.getMeter("worker").createGauge("worker.outbox.backlog").record(count);
}

export function observePool(read: () => { idle: number; total: number; waiting: number }) {
	if (!enabled()) return;
	metrics
		.getMeter("database")
		.createObservableGauge("db.client.connections", { unit: "1" })
		.addCallback(observer => {
			const pool = read();
			observer.observe(pool.idle, { state: "idle" });
			observer.observe(pool.total - pool.idle, { state: "used" });
			observer.observe(pool.waiting, { state: "waiting" });
		});
}

/** Cache family labels must come from a finite application-defined allowlist. */
export function recordCacheResult(result: "bypass" | "hit" | "miss") {
	if (enabled()) metrics.getMeter("cache").createCounter("cache.operations").add(1, { result });
}
