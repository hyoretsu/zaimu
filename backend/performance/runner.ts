export function selectScenarios(known: readonly string[], selection?: string) {
	if (selection === undefined) return [...known];
	const names = selection.split(",").map(value => value.trim());
	if (!names.length || names.some(name => !name || !known.includes(name)))
		throw new Error("Unknown or empty performance scenario selection");
	return [...new Set(names)];
}

export function percentile(values: readonly number[], fraction: number) {
	if (
		!values.length ||
		values.some(value => !Number.isFinite(value) || value < 0) ||
		fraction <= 0 ||
		fraction > 1
	)
		throw new Error("Invalid percentile samples");
	return values.toSorted((a, b) => a - b)[Math.ceil(values.length * fraction) - 1]!;
}

export function assertDedicatedApi(url: URL) {
	if (url.origin !== "http://127.0.0.1:3335" || url.username || url.password)
		throw new Error("Dedicated loopback API 3335 required");
}

export const numericHeader = (response: Response, name: string) => {
	const value = response.headers.get(name);
	if (value === null || !value.trim() || !Number.isFinite(Number(value)) || Number(value) < 0) return null;
	return Number(value);
};

export interface RequestSample {
	method?: string;
	path?: string;
	durationMs: number;
	status: number;
	bytes: number;
	queries: number | null;
	businessQueries: number | null;
	authQueries: number | null;
	sqlDurationMs: number | null;
	sqlElapsedMs: number | null;
	connectionWaitMs: number | null;
	cache: string | null;
	requestId: string | null;
	error?: string;
}

export function completeMetrics(sample: RequestSample) {
	return (
		!sample.error &&
		Boolean(sample.requestId) &&
		[
			sample.queries,
			sample.businessQueries,
			sample.authQueries,
			sample.sqlDurationMs,
			sample.sqlElapsedMs,
			sample.connectionWaitMs,
		].every(value => value !== null && Number.isFinite(value) && value >= 0) &&
		sample.queries === sample.authQueries! + sample.businessQueries!
	);
}

export async function captureRequest(
	url: URL,
	init: RequestInit,
	requester: typeof fetch = fetch,
	options: { now?: () => number; timeoutMs?: number } = {},
) {
	assertDedicatedApi(url);
	const now = options.now ?? (() => performance.now());
	const timeoutMs = options.timeoutMs ?? 60000;
	if (!Number.isFinite(timeoutMs) || timeoutMs <= 0) throw new Error("Invalid performance timeout");
	const start = now();
	let sample: RequestSample = {
		authQueries: null,
		businessQueries: null,
		bytes: 0,
		cache: null,
		connectionWaitMs: null,
		durationMs: 0,
		queries: null,
		requestId: null,
		sqlDurationMs: null,
		sqlElapsedMs: null,
		status: 0,
	};
	let text = "";
	try {
		const response = await requester(url, {
			...init,
			redirect: "error",
			signal: AbortSignal.timeout(timeoutMs),
		});
		text = await response.text();
		sample = {
			...sample,
			authQueries: numericHeader(response, "x-performance-auth-query-count"),
			businessQueries: numericHeader(response, "x-performance-business-query-count"),
			bytes: new TextEncoder().encode(text).byteLength,
			cache: response.headers.get("x-cache"),
			connectionWaitMs: numericHeader(response, "x-performance-connection-wait-ms"),
			queries: numericHeader(response, "x-performance-query-count"),
			requestId: response.headers.get("x-performance-request-id"),
			sqlDurationMs: numericHeader(response, "x-performance-sql-duration-ms"),
			sqlElapsedMs: numericHeader(response, "x-performance-sql-elapsed-ms"),
			status: response.status,
		};
	} catch (error) {
		sample.error = error instanceof Error ? error.name : "request-error";
	}
	sample.durationMs = now() - start;
	sample.method = init.method ?? "GET";
	sample.path = url.pathname;
	return { sample, text };
}

/** Fixed worker count; each slot completes before requesting its next item. */
export async function runConcurrent<T>(
	count: number,
	load: number,
	execute: (index: number, user: number) => Promise<T>,
) {
	if (!Number.isInteger(count) || count < 1 || !Number.isInteger(load) || load < 1)
		throw new Error("Invalid performance load");
	const results = new Array<T>(count);
	let next = 0;
	await Promise.all(
		Array.from({ length: Math.min(count, load) }, async (_, user) => {
			while (next < count) {
				const index = next++;
				results[index] = await execute(index, user);
			}
		}),
	);
	return results;
}
