import {
	BATCH_DEBOUNCE_MS,
	BATCH_MAX_ACTIONS,
	BATCH_MAX_BYTES,
	BATCH_MAX_WAIT_MS,
	batchActionsOverlap,
} from "../../../../shared/batch-policy";

export interface BatchOperation {
	id: string;
	method: string;
	path: string;
	body?: unknown;
}
export interface BatchResponse {
	id: string;
	status: number;
	data: unknown;
}
interface Entry {
	operation: BatchOperation;
	resolve: (response: BatchResponse) => void;
	reject: (error: unknown) => void;
	signal?: AbortSignal;
	detach: () => void;
}

/** One queue per identity + transport context. In-flight batches are serialized. */
export class ActionBatchQueue {
	private pending: Entry[] = [];
	private readonly paths = new Map<string, number>();
	private readonly duplicates = new Map<
		string,
		{ promise: Promise<BatchResponse>; signal?: AbortSignal }
	>();
	private debounce?: ReturnType<typeof setTimeout>;
	private deadline?: ReturnType<typeof setTimeout>;
	private tail: Promise<void> = Promise.resolve();
	private cancelled: unknown;

	constructor(
		private readonly send: (operations: BatchOperation[]) => Promise<BatchResponse[]>,
		private readonly timing = { debounce: BATCH_DEBOUNCE_MS, maxWait: BATCH_MAX_WAIT_MS },
	) {}

	enqueue(operation: BatchOperation, signal?: AbortSignal): Promise<BatchResponse> {
		if (this.cancelled) return Promise.reject(this.cancelled);
		if (signal?.aborted) return Promise.reject(signal.reason);
		if (
			new TextEncoder().encode(JSON.stringify({ operations: [operation] })).byteLength > BATCH_MAX_BYTES
		)
			return Promise.reject(new Error("Ação excede o limite do lote."));
		const key = JSON.stringify([operation.method, operation.path, operation.body]);
		const duplicate = this.duplicates.get(key);
		if (duplicate && duplicate.signal === signal) return duplicate.promise;
		this.paths.set(operation.path, (this.paths.get(operation.path) ?? 0) + 1);
		const promise = new Promise<BatchResponse>((resolve, reject) => {
			let detached = false;
			const abort = () => {
				this.pending = this.pending.filter(item => item !== entry);
				entry.detach();
				reject(signal?.reason);
			};
			const entry: Entry = {
				detach: () => {
					if (detached) return;
					detached = true;
					signal?.removeEventListener("abort", abort);
					const count = (this.paths.get(operation.path) ?? 1) - 1;
					if (count) this.paths.set(operation.path, count);
					else this.paths.delete(operation.path);
				},
				operation,
				reject,
				resolve,
				signal,
			};
			signal?.addEventListener("abort", abort, { once: true });
			this.pending.push(entry);
			clearTimeout(this.debounce);
			this.debounce = setTimeout(() => this.flush(), this.timing.debounce);
			this.deadline ??= setTimeout(() => this.flush(), this.timing.maxWait);
			if (this.pending.length >= BATCH_MAX_ACTIONS) this.flush();
		});
		this.duplicates.set(key, { promise, signal });
		const cleanup = () => {
			if (this.duplicates.get(key)?.promise === promise) this.duplicates.delete(key);
		};
		void promise.then(cleanup, cleanup);
		return promise;
	}

	flush(): void {
		clearTimeout(this.debounce);
		clearTimeout(this.deadline);
		this.debounce = this.deadline = undefined;
		const entries = this.pending.splice(0);
		if (!entries.length) return;
		this.tail = this.tail.then(async () => {
			// A previous send may have been running when these entries were flushed.
			const active = entries.filter(entry => {
				if (!this.cancelled && !entry.signal?.aborted) return true;
				entry.detach();
				entry.reject(this.cancelled ?? entry.signal?.reason);
				return false;
			});
			while (active.length) {
				const chunk: Entry[] = [];
				while (active.length && chunk.length < BATCH_MAX_ACTIONS) {
					const next = active[0]!;
					if (next.signal?.aborted) {
						active.shift();
						next.detach();
						next.reject(next.signal.reason);
						continue;
					}
					const size = new TextEncoder().encode(
						JSON.stringify({ operations: [...chunk, next].map(entry => entry.operation) }),
					).byteLength;
					if (chunk.length && size > BATCH_MAX_BYTES) break;
					chunk.push(active.shift()!);
				}
				if (!chunk.length) continue;
				try {
					if (this.cancelled) throw this.cancelled;
					const results = await this.send(chunk.map(entry => entry.operation));
					const byId = new Map(results.map(result => [result.id, result]));
					if (
						byId.size !== chunk.length ||
						results.length !== chunk.length ||
						chunk.some(entry => !byId.has(entry.operation.id))
					)
						throw new Error(
							"Resposta de lote incompleta. Atualize os dados antes de tentar novamente.",
						);
					for (const entry of chunk) {
						if (this.cancelled) entry.reject(this.cancelled);
						else entry.resolve(byId.get(entry.operation.id)!);
					}
				} catch (error) {
					for (const entry of chunk) entry.reject(error);
				} finally {
					for (const entry of chunk) entry.detach();
				}
			}
		});
	}

	hasConflict(path: string): boolean {
		return [...this.paths.keys()].some(queued => batchActionsOverlap(path, queued));
	}

	async drain(): Promise<void> {
		this.flush();
		await this.tail;
	}

	cancel(error: unknown): void {
		this.cancelled = error;
		clearTimeout(this.debounce);
		clearTimeout(this.deadline);
		for (const entry of this.pending.splice(0)) {
			entry.detach();
			entry.reject(error);
		}
	}
}
