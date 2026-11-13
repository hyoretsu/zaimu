import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import { DashboardComparisonQuery, PeriodReturn } from "~/modules/dashboard/application/dashboard-dtos";
import { distributedCache } from "~/shared/infra/cache";
import { ComputeBusyError, ComputeTimeoutError, offload } from "~/shared/infra/compute/offload";
import type { ComparisonJob } from "../workers/comparison.worker";

export const DashboardComparisonReturn = t.Array(PeriodReturn);
export type DashboardComparisonReturn = typeof DashboardComparisonReturn.static;

// The bundle emits the worker next to main.js (see the `build` script); source runs load the .ts file.
const ComparisonUnavailableReturn = t.Object({ message: t.String() });

const comparisonWorkerUrl = import.meta.url.endsWith(".ts")
	? new URL("../workers/comparison.worker.ts", import.meta.url)
	: new URL("./modules/dashboard/infra/workers/comparison.worker.js", import.meta.url);
const compareInWorker = (job: ComparisonJob) =>
	offload<ComparisonJob, DashboardComparisonReturn>(
		() =>
			new Worker(comparisonWorkerUrl, {
				env: Object.fromEntries(
					Object.entries(process.env).filter(
						(entry): entry is [string, string] => typeof entry[1] === "string",
					),
				),
				preload: import.meta.url.endsWith(".ts")
					? [new URL("../../../../../scripts/otel-preload.ts", import.meta.url).pathname]
					: undefined,
			}),
		job,
	);

export const DashboardComparisonController = new Elysia().get(
	"/comparison",
	async ({ query, request, set }) => {
		const userId = await requireUserId(request);
		const locationCurrency = request.headers.get("X-Currency");
		const cached = await distributedCache
			.remember(
				userId,
				"dashboard",
				{ resource: "comparison", ...query, locationCurrency, view: "currency-context-v2" },
				async (): Promise<DashboardComparisonReturn> =>
					compareInWorker({
						currency: await defaultCurrency(userId, locationCurrency),
						query,
						userId,
					}),
			)
			.catch(error => {
				if (error instanceof ComputeBusyError) {
					set.headers["retry-after"] = "30";
					set.status = 503;
				} else if (error instanceof ComputeTimeoutError) set.status = 504;
				else throw error;
				return error as Error;
			});
		if (cached instanceof Error) return { message: cached.message };
		set.headers.etag = cached.etag;
		set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
		if (request.headers.get("if-none-match") === cached.etag) {
			set.status = 304;
			return null;
		}
		return cached.value;
	},
	{
		detail: { tags: ["Dashboard"] },
		query: DashboardComparisonQuery,
		response: {
			200: DashboardComparisonReturn,
			304: t.Null(),
			503: ComparisonUnavailableReturn,
			504: ComparisonUnavailableReturn,
		},
	},
);
