import { summarize } from "./sanitize";
const operationalTypes = new Set([
	"http_request",
	"http_error",
	"worker_job",
	"broker_publish",
	"broker_consume",
	"outbox_batch",
	"cache_operation",
]);
/** Do not forward free text, error messages, filenames, identifiers or arbitrary object keys. */
export function operationalLog(args: unknown[]) {
	let record: Record<string, unknown> | undefined;
	if (typeof args[0] === "string" && args[0].length <= 65536) {
		try {
			const parsed = JSON.parse(args[0]);
			if (parsed && typeof parsed === "object" && !Array.isArray(parsed)) record = parsed;
		} catch {
			/* Free text stays local. */
		}
	}
	const type =
		typeof record?.type === "string" && operationalTypes.has(record.type)
			? record.type
			: "application.log";
	const summary = record ? summarize(record) : summarize(args);
	return {
		attributes: { "log.argument_count": args.length, "log.summary": summary },
		body: type,
		fields: performanceFields(record, type),
	};
}

/** Preserve existing diagnostic counters without admitting arbitrary record values. */
function performanceFields(record: Record<string, unknown> | undefined, type: string) {
	const fields: Record<string, unknown> = { type };
	if (!record || !["http_request", "worker_job", "cache_operation", "outbox_batch"].includes(type))
		return fields;
	const numeric = (value: unknown) => typeof value === "number" && Number.isFinite(value) && value >= 0;
	for (const key of [
		"authQueryCount",
		"businessQueryCount",
		"bytes",
		"connectionWaitMs",
		"durationMs",
		"eventLoopLagP95Ms",
		"queryCount",
		"queueLagMs",
		"redisWaitMs",
		"sqlDurationMs",
		"sqlElapsedMs",
		"status",
		"claimed",
		"failed",
		"published",
	]) {
		if (numeric(record[key])) fields[key] = record[key];
	}
	for (const key of ["requestId", "jobId"]) {
		const value = record[key];
		if (
			typeof value === "string" &&
			/^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i.test(value)
		)
			fields[key] = value;
	}

	if (record.outcome === "ok" || record.outcome === "error") fields.outcome = record.outcome;
	if (typeof record.result === "string" && ["hit", "miss", "bypass"].includes(record.result))
		fields.result = record.result;
	const queues = new Set([
		"open-finance-sync",
		"import-file",
		"cache-invalidation",
		"schedule-materialization",
		"reference-rate-fetch",
		"currency-rate-history-fetch",
		"account-yield-recalculation",
	]);
	if (typeof record.queue === "string") fields.queue = queues.has(record.queue) ? record.queue : "unknown";
	if (typeof record.completed === "boolean") fields.completed = record.completed;
	if (
		typeof record.method === "string" &&
		["GET", "POST", "PUT", "PATCH", "DELETE", "HEAD", "OPTIONS"].includes(record.method)
	)
		fields.method = record.method;
	for (const [key, names] of [
		["pool", ["idle", "total", "waiting"]],
		["cpuMicros", ["user", "system"]],
		["processCpuMicros", ["user", "system"]],
		["memory", ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"]],
		["processMemory", ["rss", "heapTotal", "heapUsed", "external", "arrayBuffers"]],
	] as const) {
		const value = record[key];
		if (value && typeof value === "object")
			fields[key] = Object.fromEntries(
				names.flatMap(name => {
					const item = (value as Record<string, unknown>)[name];
					return numeric(item) ? [[name, item]] : [];
				}),
			);
	}
	const spanNames = new Set([
		"credit-book:load",
		"credit-book:persist",
		"auth",
		"redis",
		"loader",
		"loader:lock-bypass",
		"sql:SELECT",
		"sql:INSERT",
		"sql:UPDATE",
		"sql:DELETE",
		"sql:BEGIN",
		"sql:COMMIT",
		"sql:ROLLBACK",
		"sql:WITH",
		"sql:OTHER",
	]);
	if (Array.isArray(record.spans))
		fields.spans = record.spans.slice(0, 20).flatMap(value => {
			if (!value || typeof value !== "object" || !numeric(value.durationMs) || !numeric(value.startMs))
				return [];
			return [
				{
					durationMs: value.durationMs,
					name: spanNames.has(value.name) ? value.name : "operation",
					outcome: value.outcome === "error" ? "error" : "ok",
					startMs: value.startMs,
				},
			];
		});
	return fields;
}
