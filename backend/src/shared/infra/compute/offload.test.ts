import { expect, test } from "bun:test";
import { ComputeBusyError, ComputeTimeoutError, offload } from "./offload";

class FakeWorker {
	onmessage: ((event: { data: unknown }) => void) | null = null;
	onerror: ((event: { message: string }) => void) | null = null;
	terminated = false;
	constructor(private readonly behavior: (worker: FakeWorker, input: unknown) => void) {}
	postMessage(input: unknown) {
		this.behavior(this, input);
	}
	terminate() {
		this.terminated = true;
	}
}
const rejection = (promise: Promise<unknown>) =>
	promise.then(
		() => {
			throw new Error("expected a rejection");
		},
		(error: Error) => error,
	);
const asWorker = (worker: FakeWorker) => worker as unknown as Worker;

test("resolves with the worker result and terminates the worker", async () => {
	const worker = new FakeWorker((self, input) =>
		queueMicrotask(() => self.onmessage?.({ data: { ok: true, result: Number(input) * 2 } })),
	);
	expect(await offload(() => asWorker(worker), 21)).toBe(42);
	expect(worker.terminated).toBe(true);
});

test("rebuilds worker errors with their original name", async () => {
	const worker = new FakeWorker(self =>
		queueMicrotask(() =>
			self.onmessage?.({ data: { error: { message: "sem cotação", name: "Unavailable" }, ok: false } }),
		),
	);
	const error = await rejection(offload(() => asWorker(worker), null));
	expect(error.name).toBe("Unavailable");
	expect(error.message).toBe("sem cotação");
});

test("terminates a worker that exceeds its deadline", async () => {
	const worker = new FakeWorker(() => undefined);
	const error = await rejection(offload(() => asWorker(worker), null, { timeoutMs: 20 }));
	expect(error).toBeInstanceOf(ComputeTimeoutError);
	expect(worker.terminated).toBe(true);
});

test("rejects instead of queueing beyond the concurrency limit, then recovers", async () => {
	const hanging = new FakeWorker(() => undefined);
	const first = rejection(offload(() => asWorker(hanging), null, { maxConcurrent: 1, timeoutMs: 50 }));
	const rejected = await rejection(
		offload(() => asWorker(new FakeWorker(() => undefined)), null, { maxConcurrent: 1 }),
	);
	expect(rejected).toBeInstanceOf(ComputeBusyError);
	expect(await first).toBeInstanceOf(ComputeTimeoutError);
	const done = new FakeWorker(self =>
		queueMicrotask(() => self.onmessage?.({ data: { ok: true, result: 1 } })),
	);
	expect(await offload(() => asWorker(done), null, { maxConcurrent: 1 })).toBe(1);
});

test("surfaces worker crashes", async () => {
	const worker = new FakeWorker(self => queueMicrotask(() => self.onerror?.({ message: "boom" })));
	expect((await rejection(offload(() => asWorker(worker), null))).message).toBe("boom");
});
