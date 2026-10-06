import { monitorEventLoopDelay } from "node:perf_hooks";
import { getPoolMetrics, getQueryMetrics, withQueryMetrics } from "sql";

/** CPU/memory describe the process interval and can overlap other jobs. SQL belongs to this job only. */
export function instrumentJob<Result>(
	queue: string,
	publishedAt: number | undefined,
	operation: () => Promise<Result>,
	emit: (record: Record<string, unknown>) => void = record => console.info(JSON.stringify(record)),
) {
	return withQueryMetrics(async () => {
		const metrics = getQueryMetrics()!;
		const diagnostics = process.env.PERFORMANCE_METRICS_HEADERS === "true";
		const cpu = diagnostics ? process.cpuUsage() : undefined;
		const lag = diagnostics ? monitorEventLoopDelay({ resolution: 20 }) : undefined;
		lag?.enable();
		const timestamp =
			publishedAt === undefined ? undefined : publishedAt < 1e12 ? publishedAt * 1000 : publishedAt;
		const queueLagMs =
			timestamp === undefined || !Number.isFinite(timestamp) ? null : Math.max(0, Date.now() - timestamp);
		let outcome = "error";
		try {
			const result = await operation();
			outcome = "ok";
			return result;
		} finally {
			metrics.active = false;
			lag?.disable();
			emit({
				authQueryCount: metrics.authQueryCount,
				businessQueryCount: metrics.businessQueryCount,
				connectionWaitMs: metrics.connectionWaitMs,
				durationMs: performance.now() - metrics.startedAt,
				jobId: metrics.requestId,
				outcome,
				pool: getPoolMetrics(),
				queryCount: metrics.queryCount,
				queue,
				queueLagMs,
				redisWaitMs: metrics.redisWaitMs,
				sqlDurationMs: metrics.sqlDurationMs,
				sqlElapsedMs: metrics.sqlElapsedMs,
				type: "worker_job",
				...(diagnostics
					? {
							eventLoopLagP95Ms: lag && Number.isFinite(lag.percentile(95)) ? lag.percentile(95) / 1e6 : null,
							processCpuMicros: process.cpuUsage(cpu),
							processMemory: process.memoryUsage(),
							spans: metrics.spans,
						}
					: {}),
			});
		}
	});
}
