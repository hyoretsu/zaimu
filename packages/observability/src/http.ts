import {
	context,
	metrics,
	propagation,
	ROOT_CONTEXT,
	SpanKind,
	SpanStatusCode,
	trace,
} from "@opentelemetry/api";
import {
	bindOperationContext,
	enabled,
	getOperationRoot,
	setOperationRoute,
	withoutObservability,
} from "./index";

const routes = new WeakMap<object, string>();
const tracer = trace.getTracer("http");
const meter = metrics.getMeter("http");
const latency = meter.createHistogram("http.server.request.duration", {
	advice: { explicitBucketBoundaries: [0.001, 0.005, 0.01, 0.025, 0.05, 0.1, 0.25, 0.5, 1, 2, 5, 10] },
	unit: "s",
});
const inflight = meter.createUpDownCounter("http.server.active_requests");
export function instrumentRequest(handle: (request: Request) => Response | Promise<Response>) {
	return async (request: Request): Promise<Response> => {
		if (new URL(request.url).pathname.startsWith("/telemetry/"))
			return withoutObservability(() => handle(request));
		if (!enabled()) return handle(request);
		const carrier: Record<string, string> = {};
		for (const key of ["traceparent", "tracestate"]) {
			const value = request.headers.get(key);
			if (value) carrier[key] = value;
		}
		const parent = propagation.extract(ROOT_CONTEXT, carrier);
		const span = tracer.startSpan(
			"HTTP request",
			{ attributes: { "http.request.method": request.method }, kind: SpanKind.SERVER },
			parent,
		);
		const active = trace.setSpan(parent, span);
		const run = bindOperationContext(span);
		const started = performance.now();
		inflight.add(1);
		let finished = false;
		const finish = (status: number, completed: boolean) => {
			if (finished) return;
			finished = true;
			request.signal.removeEventListener("abort", abort);
			span.setAttribute("http.response.status_code", status);
			span.setAttribute("http.response.completed", completed);
			if (status >= 500 || !completed) span.setStatus({ code: SpanStatusCode.ERROR });
			// Route is set by the framework; never use request paths as metric labels.
			latency.record(
				(performance.now() - started) / 1000,
				{ "http.response.status_code": status, "http.route": routes.get(span) ?? "unmatched" },
				active,
			);
			inflight.add(-1);
			span.end();
		};
		const abort = () => finish(499, false);
		request.signal.addEventListener("abort", abort, { once: true });
		if (request.signal.aborted) abort();
		try {
			const response = await context.with(active, () => run(() => handle(request)));
			if (!response.body || request.method === "HEAD") {
				finish(response.status, true);
				return response;
			}
			const reader = response.body.getReader();
			const body = new ReadableStream<Uint8Array>({
				cancel: reason =>
					context.with(active, () =>
						run(async () => {
							try {
								await reader.cancel(reason);
							} finally {
								finish(response.status, false);
							}
						}),
					),
				pull: controller =>
					context.with(active, () =>
						run(async () => {
							try {
								const result = await reader.read();
								if (result.done) {
									finish(response.status, true);
									controller.close();
								} else controller.enqueue(result.value);
							} catch (error) {
								finish(response.status, false);
								controller.error(error);
							}
						}),
					),
			});
			return new Response(body, {
				headers: response.headers,
				status: response.status,
				statusText: response.statusText,
			});
		} catch (error) {
			finish(500, false);
			throw error;
		}
	};
}
export function setHttpRoute(route: string) {
	if (typeof route !== "string" || route.length > 256) return;
	const span = getOperationRoot() ?? trace.getSpan(context.active());
	if (span) {
		routes.set(span, route);
		setOperationRoute(span, route);
	}
	span?.setAttribute("http.route", route);
	span?.updateName(route);
}
