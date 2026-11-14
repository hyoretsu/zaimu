import { monitorEventLoopDelay } from "node:perf_hooks";
import { businessNow } from "@zaimu/finance/time-zone";
import { getPoolMetrics, getQueryMetrics, queryRaw, withQueryKind, withQueryMetrics } from "sql";
import { businessDateSql } from "../sql/business-date";

const lag = monitorEventLoopDelay({ resolution: 20 });
lag.enable();
const round = (value: number) => Number(value.toFixed(2));

export const instrumentHttp =
	(handle: (request: Request) => Response | Promise<Response>) => (request: Request) =>
		withQueryMetrics(async () => {
			const metrics = getQueryMetrics()!;
			const cpu = process.cpuUsage();
			const response = await withQueryKind(
				new URL(request.url).pathname.startsWith("/api/auth/") ? "auth" : "business",
				() => handle(request),
			);
			// Work scheduled after the handler cannot keep modifying request counters.
			metrics.active = false;
			const headers = new Headers(response.headers);
			if (process.env.PERFORMANCE_METRICS_HEADERS === "true") {
				headers.set("x-performance-namespace", process.env.SERVICE_NAMESPACE ?? "");
				// A preflight handshake through the running bundle and its actual pool.
				// Only health requests pay for this query, outside measured scenarios.
				if (
					new URL(request.url).pathname === "/health" &&
					process.env.SERVICE_NAMESPACE === "zaimu_performance"
				) {
					const [clock] = await queryRaw<{ date: string }>(
						`SELECT (${businessDateSql})::text AS date`,
					);
					headers.set("x-performance-business-date", businessNow().toISOString().slice(0, 10));
					headers.set("x-performance-sql-business-date", clock?.date ?? "");
					headers.set("x-performance-operational-epoch", String(Date.now()));
				}
				headers.set("x-performance-query-count", String(metrics.queryCount));
				headers.set("x-performance-auth-query-count", String(metrics.authQueryCount));
				headers.set("x-performance-business-query-count", String(metrics.businessQueryCount));
				headers.set("x-performance-sql-duration-ms", String(round(metrics.sqlDurationMs)));
				headers.set("x-performance-sql-elapsed-ms", String(round(metrics.sqlElapsedMs)));
				headers.set("x-performance-connection-wait-ms", String(round(metrics.connectionWaitMs)));
				headers.set("x-performance-request-id", metrics.requestId);
			}
			let bytes = 0;
			let logged = false;
			const log = (completed: boolean) => {
				if (logged) return;
				logged = true;
				const usage = process.cpuUsage(cpu);
				console.info(
					JSON.stringify({
						authQueryCount: metrics.authQueryCount,
						businessQueryCount: metrics.businessQueryCount,
						bytes,
						completed,
						connectionWaitMs: round(metrics.connectionWaitMs),
						durationMs: round(performance.now() - metrics.startedAt),
						method: request.method,
						pool: getPoolMetrics(),
						queryCount: metrics.queryCount,
						requestId: metrics.requestId,
						route: metrics.route ?? "unmatched",
						sqlDurationMs: round(metrics.sqlDurationMs),
						sqlElapsedMs: round(metrics.sqlElapsedMs),
						status: response.status,
						type: "http_request",
						...(process.env.PERFORMANCE_METRICS_HEADERS === "true"
							? {
									cpuMicros: usage,
									eventLoopLagP95Ms: Number.isFinite(lag.percentile(95))
										? round(lag.percentile(95) / 1e6)
										: null,
									memory: process.memoryUsage(),
									spans: metrics.spans,
								}
							: {}),
					}),
				);
			};
			if (!response.body) {
				log(true);
				return new Response(null, {
					headers,
					status: response.status,
					statusText: response.statusText,
				});
			}
			const reader = response.body.getReader();
			const body = new ReadableStream<Uint8Array>({
				async cancel(reason) {
					log(false);
					await reader.cancel(reason);
				},
				async pull(controller) {
					try {
						const next = await reader.read();
						if (next.done) {
							log(true);
							controller.close();
						} else {
							bytes += next.value.byteLength;
							controller.enqueue(next.value);
						}
					} catch (error) {
						log(false);
						controller.error(error);
					}
				},
			});
			return new Response(body, { headers, status: response.status, statusText: response.statusText });
		});
