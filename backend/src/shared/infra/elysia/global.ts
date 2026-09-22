import Elysia from "elysia";
import { beginQueryMetrics, getQueryMetrics } from "sql";
import { HttpException } from "~/shared/errors";

export const GlobalPlugin = new Elysia({ name: "GlobalPlugin" })
	.derive(() => ({ requestStartedAt: performance.now() }))
	.onRequest(() => beginQueryMetrics())
	.onAfterResponse(({ request, requestStartedAt }) => {
		const metrics = getQueryMetrics();
		console.info(
			JSON.stringify({
				connectionWaitMs: Number((metrics?.connectionWaitMs ?? 0).toFixed(2)),
				durationMs: Number((performance.now() - requestStartedAt).toFixed(2)),
				method: request.method,
				path: new URL(request.url).pathname,
				queryCount: metrics?.queryCount ?? 0,
				sqlDurationMs: Number((metrics?.sqlDurationMs ?? 0).toFixed(2)),
				type: "http_request",
			}),
		);
	})
	.error({ HttpException })
	.onError(({ code, error, set }) => {
		if (code === "HttpException") {
			set.status = error.statusCode;
			return { error: error.message };
		}

		console.error(error);
		return { error: "Internal Server Error" };
	})
	.as("global");
