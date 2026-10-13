import { expect, test } from "bun:test";
import { mkdtemp, readFile, rm } from "node:fs/promises";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { PerformanceJournal, recoverJournal } from "./journal";

const header = JSON.stringify({
	configuration: { rounds: 3 },
	namespace: "zaimu_performance",
	type: "start",
	version: 1,
});
const line = (value: unknown) => `${JSON.stringify(value)}\n`;

test("interrupted journal preserves completed groups and identifies unfinished scenario", () => {
	const journal = `${header}\n${line({ key: "accounts:1:1:hot", type: "begin" })}${line({ key: "accounts:1:1:hot", result: { passed: true, samples: [{ durationMs: 4 }] }, type: "result" })}${line({ key: "purchase:1:20", type: "begin" })}{"type":`;
	const recovered = recoverJournal(journal);
	expect(Object.keys(recovered.results)).toEqual(["accounts:1:1:hot"]);
	expect(recovered.incompleteScenarios).toEqual(["purchase:1:20"]);
	expect(recovered.interrupted).toBeTrue();
	expect(recovered.truncatedTail).toBeTrue();
	expect(recovered.passed).toBeFalse();
});

test("finished journal cannot substitute for complete acceptance and metrics", () => {
	const recovered = recoverJournal(`${header}\n${line({ type: "finished" })}`);
	expect(recovered.interrupted).toBeFalse();
	expect(recovered.complete).toBeFalse();
	expect(recovered.passed).toBeFalse();
});

test("corrupt, foreign, duplicate and out-of-order records are rejected", () => {
	expect(() =>
		recoverJournal(line({ configuration: {}, namespace: "zaimu", type: "start", version: 1 })),
	).toThrow();
	expect(() => recoverJournal(`${header}\ninvalid\n`)).toThrow();
	expect(() =>
		recoverJournal(`${header}\n${line({ key: "a", type: "begin" })}${line({ key: "a", type: "begin" })}`),
	).toThrow();
	expect(() =>
		recoverJournal(`${header}\n${line({ key: "a", result: { passed: true, samples: [] }, type: "result" })}`),
	).toThrow();
	expect(() =>
		recoverJournal(`${header}\n${line({ type: "finished" })}${line({ key: "a", type: "begin" })}`),
	).toThrow();
	expect(() =>
		recoverJournal(line({ configuration: [], namespace: "zaimu_performance", type: "start", version: 1 })),
	).toThrow();
});

test("writer durably preserves results before final report and propagates storage failures", async () => {
	const directory = await mkdtemp(join(tmpdir(), "zaimu-journal-"));
	try {
		const path = join(directory, "run.jsonl");
		const journal = new PerformanceJournal(path);
		await journal.initialize({ rounds: 3 });
		await journal.begin("purchase:1:1");
		await journal.complete("purchase:1:1", { passed: false, samples: [{ durationMs: 1500 }] });
		const partial = recoverJournal(await readFile(path, "utf8"));
		expect(partial.interrupted).toBeTrue();
		expect(partial.results["purchase:1:1"]).toEqual({ passed: false, samples: [{ durationMs: 1500 }] });
		await journal.finish();
		expect(recoverJournal(await readFile(path, "utf8")).interrupted).toBeFalse();
		await expect(
			new PerformanceJournal(join(directory, "missing", "run.jsonl")).initialize({}),
		).rejects.toThrow();
	} finally {
		await rm(directory, { force: true, recursive: true });
	}
});
