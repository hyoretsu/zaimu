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
	const response = await request(url, { headers: { cookie } });
	if (!response.ok)
		throw new Error(`${url.pathname} retornou HTTP ${response.status}: ${await response.text()}`);
	await response.arrayBuffer();
	const durationMs = performance.now() - startedAt;
	const queryCount = response.headers.get("x-performance-query-count");
	const sqlDurationMs = response.headers.get("x-performance-sql-duration-ms");
	return {
		durationMs,
		queryCount: queryCount === null ? null : Number(queryCount),
		sqlDurationMs: sqlDurationMs === null ? null : Number(sqlDurationMs),
	};
}
