import { AsyncLocalStorage } from "node:async_hooks";

export type QueryKind = "auth" | "business";
export interface OperationSpan {
	name: string;
	startMs: number;
	durationMs: number;
	outcome: "ok" | "error";
}
export interface QueryMetrics {
	active: boolean;
	requestId: string;
	startedAt: number;
	queryCount: number;
	authQueryCount: number;
	businessQueryCount: number;
	connectionWaitMs: number;
	sqlDurationMs: number;
	sqlElapsedMs: number;
	redisWaitMs: number;
	route?: string;
	spans: OperationSpan[];
}
const storage = new AsyncLocalStorage<QueryMetrics>();
const kinds = new AsyncLocalStorage<QueryKind>();
export const createQueryMetrics = (): QueryMetrics => ({
	active: true,
	authQueryCount: 0,
	businessQueryCount: 0,
	connectionWaitMs: 0,
	queryCount: 0,
	redisWaitMs: 0,
	requestId: crypto.randomUUID(),
	spans: [],
	sqlDurationMs: 0,
	sqlElapsedMs: 0,
	startedAt: performance.now(),
});
export const getQueryMetrics = () => {
	const metrics = storage.getStore();
	return metrics?.active ? metrics : undefined;
};
export const withQueryMetrics = <Result>(operation: () => Result) =>
	storage.run(createQueryMetrics(), operation);
export const withQueryKind = <Result>(kind: QueryKind, operation: () => Result) => kinds.run(kind, operation);
export const withoutQueryMetrics = <Result>(operation: () => Result) => storage.exit(operation);
// Capture context at start, never look up another request's context on completion.
export const startOperation = (name: string) => {
	const metrics = getQueryMetrics();
	const startedAt = performance.now();
	let finished = false;
	return (outcome: OperationSpan["outcome"] = "ok") => {
		if (finished || !metrics?.active) return;
		finished = true;
		if (metrics.spans.length < 256)
			metrics.spans.push({
				durationMs: performance.now() - startedAt,
				name,
				outcome,
				startMs: startedAt - metrics.startedAt,
			});
	};
};
export const measureOperation = async <Result>(
	name: string,
	operation: () => PromiseLike<Result>,
): Promise<Result> => {
	const finish = startOperation(name);
	try {
		const value = await operation();
		finish();
		return value;
	} catch (error) {
		finish("error");
		throw error;
	}
};
// Union of overlapping SQL intervals, separate from sum of operation durations.
const sqlIntervals = new WeakMap<QueryMetrics, [number, number][]>();
export const startQuery = () => {
	const metrics = getQueryMetrics();
	const kind = kinds.getStore() ?? "business";
	const startedAt = performance.now();
	let finished = false;
	return () => {
		if (finished || !metrics?.active) return;
		finished = true;
		const endedAt = performance.now();
		metrics.queryCount++;
		if (kind === "auth") metrics.authQueryCount++;
		else metrics.businessQueryCount++;
		metrics.sqlDurationMs += endedAt - startedAt;
		const intervals = sqlIntervals.get(metrics) ?? [];
		intervals.push([startedAt, endedAt]);
		intervals.sort((a, b) => a[0] - b[0]);
		const merged: [number, number][] = [];
		for (const interval of intervals) {
			const previous = merged.at(-1);
			if (previous && interval[0] <= previous[1]) previous[1] = Math.max(previous[1], interval[1]);
			else merged.push(interval);
		}
		sqlIntervals.set(metrics, merged);
		metrics.sqlElapsedMs = merged.reduce((sum, [start, end]) => sum + end - start, 0);
	};
};
