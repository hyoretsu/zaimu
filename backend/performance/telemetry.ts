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
	for (const key of ["cpuMicros", "pool", "memory"])
		if (!record[key] || typeof record[key] !== "object") return false;
	return (
		typeof record.eventLoopLagP95Ms === "number" &&
		Number.isFinite(record.eventLoopLagP95Ms) &&
		record.eventLoopLagP95Ms >= 0
	);
}
