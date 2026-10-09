import type { RequestSample } from "./runner";

export async function readTelemetry(path: string | undefined) {
	const byRequest = new Map<string, Record<string, unknown>>();
	if (!path) return byRequest;
	for (const line of (await Bun.file(path).text()).split("\n")) {
		try {
			const value = JSON.parse(line) as Record<string, unknown>;
			if (value.type === "http_request" && typeof value.requestId === "string") {
				const {
					requestId,
					route,
					method,
					status,
					durationMs,
					bytes,
					completed,
					pool,
					spans,
					cpuMicros,
					eventLoopLagP95Ms,
					memory,
				} = value;
				byRequest.set(requestId, {
					bytes,
					completed,
					cpuMicros,
					durationMs,
					eventLoopLagP95Ms,
					memory,
					method,
					pool,
					requestId,
					route,
					spans,
					status,
				});
			}
		} catch {
			/* Other local process logs are not request telemetry. */
		}
	}
	return byRequest;
}

export function attachTelemetry(sample: RequestSample, telemetry: Map<string, Record<string, unknown>>) {
	const record = sample.requestId ? telemetry.get(sample.requestId) : undefined;
	return { ...sample, telemetry: record ?? null };
}

export function completeTelemetry(record: Record<string, unknown> | undefined) {
	if (record?.completed !== true || !Array.isArray(record.spans) || !record.spans.length) return false;
	const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
	const fields = (value: unknown, names: string[]) =>
		value !== null &&
		typeof value === "object" &&
		names.every(name => numeric((value as Record<string, unknown>)[name]));
	return (
		fields(record.cpuMicros, ["user", "system"]) &&
		fields(record.pool, ["idle", "total", "waiting"]) &&
		fields(record.memory, ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"]) &&
		numeric(record.eventLoopLagP95Ms) &&
		record.spans.every(
			span => span && typeof span.name === "string" && numeric(span.durationMs) && numeric(span.startMs),
		)
	);
}
