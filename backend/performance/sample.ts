import { numericHeader } from "./runner";
export interface PerformanceSample {
	durationMs: number;
	queryCount: number | null;
	sqlDurationMs: number | null;
}

export async function measureRequest(
	url: URL,
	cookie: string,
	request: (input: URL, init: RequestInit) => Promise<Response> = fetch,
): Promise<PerformanceSample> {
	const startedAt = performance.now();
	const response = await request(url, {
		headers: { cookie },
		redirect: "error",
		signal: AbortSignal.timeout(60000),
	});
	if (!response.ok)
		throw new Error(`${url.pathname} retornou HTTP ${response.status}: ${await response.text()}`);
	await response.arrayBuffer();
	const durationMs = performance.now() - startedAt;
	return {
		durationMs,
		queryCount: numericHeader(response, "x-performance-query-count"),
		sqlDurationMs: numericHeader(response, "x-performance-sql-duration-ms"),
	};
}
