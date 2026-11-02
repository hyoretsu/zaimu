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
>(read: () => Promise<T>, onProgress?: (progress: ImportProgress) => void): Promise<T> {
	for (;;) {
		const batch = await read();
		onProgress?.({
			completed: batch.results.filter(item => item.status === "SUCCEEDED" || item.status === "FAILED")
				.length,
			total: batch.results.length,
		});
		if (batch.status === "COMPLETED") return batch;
		await new Promise(resolve => setTimeout(resolve, 1500));
	}
}
