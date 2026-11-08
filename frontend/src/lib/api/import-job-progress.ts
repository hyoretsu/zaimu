import { onImportBatchProgress } from "../realtime";

// Safety net only: progress normally arrives over the realtime stream.
const fallbackPollMs = 20_000;

export interface ImportProgress {
	completed: number;
	total: number;
}

// Retain accepted jobs after a polling/network failure. Retrying resumes status,
// never submits already accepted PDFs a second time.
const acceptedBatches = new Map<string, string>();

export async function resumeImportBatch<T>(
	key: string,
	enqueue: () => Promise<{ batchId: string }>,
	wait: (batchId: string) => Promise<T>,
): Promise<T> {
	const storageKey = `import-batch:${key}`;
	let stored: string | undefined;
	try {
		stored = sessionStorage.getItem(storageKey) ?? undefined;
	} catch {}
	let batchId = acceptedBatches.get(key) ?? stored;
	if (!batchId) {
		batchId = (await enqueue()).batchId;
		acceptedBatches.set(key, batchId);
		try {
			sessionStorage.setItem(storageKey, batchId);
		} catch {}
	}
	const result = await wait(batchId);
	acceptedBatches.delete(key);
	try {
		sessionStorage.removeItem(storageKey);
	} catch {}
	return result;
}

export async function waitForImportBatch<
	T extends {
		status: "QUEUED" | "RUNNING" | "COMPLETED";
		results: { status: "QUEUED" | "RUNNING" | "SUCCEEDED" | "FAILED" }[];
	},
>(batchId: string, read: () => Promise<T>, onProgress?: (progress: ImportProgress) => void): Promise<T> {
	let wake: (() => void) | undefined;
	// A push that lands while a read is in flight must trigger another read.
	let dirty = false;
	const unsubscribe = onImportBatchProgress(batchId, () => {
		dirty = true;
		wake?.();
	});
	try {
		for (;;) {
			dirty = false;
			const batch = await read();
			onProgress?.({
				completed: batch.results.filter(
					item => item.status === "SUCCEEDED" || item.status === "FAILED",
				).length,
				total: batch.results.length,
			});
			if (batch.status === "COMPLETED") return batch;
			if (dirty) continue;
			await new Promise<void>(resolve => {
				const timer = setTimeout(resolve, fallbackPollMs);
				wake = () => {
					clearTimeout(timer);
					resolve();
				};
			});
			wake = undefined;
		}
	} finally {
		unsubscribe();
	}
}
