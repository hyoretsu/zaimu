import { appendFile, writeFile } from "node:fs/promises";

const journalRecord = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value)) throw new Error("Invalid journal object");
	return value as Record<string, unknown>;
};

/** Append completed groups once; interruption never discards preceding measurements. */
export class PerformanceJournal {
	constructor(private readonly path: string) {}
	async initialize(configuration: Record<string, unknown>) {
		await writeFile(
			this.path,
			`${JSON.stringify({ configuration, namespace: "zaimu_performance", type: "start", version: 1 })}\n`,
		);
	}
	private async append(value: Record<string, unknown>) {
		await appendFile(this.path, `${JSON.stringify(value)}\n`);
	}
	begin(key: string) {
		return this.append({ key, type: "begin" });
	}
	complete(key: string, result: unknown) {
		return this.append({ key, result, type: "result" });
	}
	finish() {
		return this.append({ type: "finished" });
	}
}

/** Recovery is evidence only. The final acceptance report remains authoritative. */
export function recoverJournal(contents: string) {
	const lines = contents.split("\n");
	const tail = lines.pop();
	const header = journalRecord(JSON.parse(lines.shift() ?? "null"));
	if (
		header?.type !== "start" ||
		header.version !== 1 ||
		header.namespace !== "zaimu_performance" ||
		!header.configuration ||
		typeof header.configuration !== "object"
	)
		throw new Error("Invalid performance journal header");
	const configuration = journalRecord(header.configuration);
	const results = Object.create(null) as Record<string, unknown>;
	const pending = new Set<string>();
	let finished = false;
	for (const line of lines) {
		const entry = journalRecord(JSON.parse(line));
		if (finished) throw new Error("Record after journal completion");
		if (entry.type === "finished") {
			finished = true;
			continue;
		}
		if (typeof entry.key !== "string" || !entry.key || Object.hasOwn(results, entry.key))
			throw new Error("Invalid or duplicate journal scenario");
		if (entry.type === "begin") {
			if (pending.has(entry.key)) throw new Error("Duplicate scenario start");
			pending.add(entry.key);
		} else if (entry.type === "result") {
			const result = journalRecord(entry.result);
			if (!pending.has(entry.key) || typeof result.passed !== "boolean" || !Array.isArray(result.samples))
				throw new Error("Invalid journal scenario result");
			results[entry.key] = result;
			pending.delete(entry.key);
		} else throw new Error("Unknown journal record");
	}
	return {
		complete: false,
		configuration,
		incompleteScenarios: [...pending],
		interrupted: !finished,
		passed: false,
		results,
		truncatedTail: Boolean(tail),
	};
}

if (import.meta.main) {
	const path = process.argv[2];
	if (!path) throw new Error("Usage: bun backend/performance/journal.ts <journal.jsonl>");
	console.log(JSON.stringify(recoverJournal(await Bun.file(path).text()), null, 2));
}
