import { expect, test } from "bun:test";
import { prettyRecord } from "./pretty";

test("structured records become one readable line without identifiers", () => {
	const line = prettyRecord(
		[
			JSON.stringify({
				durationMs: 95.53,
				outcome: "ok",
				queue: "cache-invalidation",
				service: "zaimu-worker",
				severity: "info",
				timestamp: "2026-11-15T01:15:15.177Z",
				trace_id: "abc",
				type: "worker_job",
			}),
		],
		"info",
	);
	expect(line).toBe(
		"01:15:15.177 INFO  zaimu-worker worker_job durationMs=95.5 outcome=ok queue=cache-invalidation",
	);
});

test("free text is left untouched", () => {
	expect(prettyRecord(["plain message"], "info")).toBeUndefined();
});

test("errors keep message and stack on following lines", () => {
	const line = prettyRecord(
		[
			JSON.stringify({
				message: "boom",
				name: "Error",
				requestId: "r1",
				severity: "error",
				stack: "    at a (x.ts:1:1)",
				timestamp: "2026-11-15T06:31:51.448Z",
				type: "http_error",
			}),
		],
		"error",
		"zaimu-api",
	);
	expect(line).toBe(
		"06:31:51.448 ERROR zaimu-api http_error message=boom name=Error requestId=r1\n    at a (x.ts:1:1)",
	);
});
