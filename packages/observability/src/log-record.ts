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
	return { attributes: { "log.argument_count": args.length, "log.summary": summary }, body: type };
}
