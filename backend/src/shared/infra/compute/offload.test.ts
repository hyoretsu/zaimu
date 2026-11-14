import { expect, test } from "bun:test";
import { ComputeBusyError, ComputeTimeoutError, offload, serveWorker } from "./offload";

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

test("returns results before telemetry flush and terminates on its control message", async () => {
	const worker = new FakeWorker(self =>
		queueMicrotask(() => self.onmessage?.({ data: { ok: true, result: 42, telemetryPending: true } })),
	);
	expect(await offload(() => asWorker(worker), null)).toBe(42);
	expect(worker.terminated).toBe(false);
	worker.onmessage?.({ data: { type: "zaimu.compute.telemetry-flushed" } });
	expect(worker.terminated).toBe(true);
});

test("ignores an early telemetry control instead of treating it as a result", async () => {
	const worker = new FakeWorker(self =>
		queueMicrotask(() => {
			self.onmessage?.({ data: { type: "zaimu.compute.telemetry-flushed" } });
			self.onmessage?.({ data: { ok: true, result: 7 } });
		}),
	);
	expect(await offload(() => asWorker(worker), null)).toBe(7);
	expect(worker.terminated).toBe(true);
});

test("bounds telemetry grace and keeps its worker in the concurrency limit", async () => {
	const worker = new FakeWorker(self =>
		queueMicrotask(() => self.onmessage?.({ data: { ok: true, result: 42, telemetryPending: true } })),
	);
	expect(await offload(() => asWorker(worker), null, { maxConcurrent: 1 })).toBe(42);
	expect(
		await rejection(offload(() => asWorker(new FakeWorker(() => undefined)), null, { maxConcurrent: 1 })),
	).toBeInstanceOf(ComputeBusyError);
	await new Promise(resolve => setTimeout(resolve, 1100));
	expect(worker.terminated).toBe(true);
});

test("releases the concurrency slot when worker creation throws", async () => {
	expect(
		(
			await rejection(
				offload(
					() => {
						throw new Error("creation failed");
					},
					null,
					{ maxConcurrent: 1 },
				),
			)
		).message,
	).toBe("creation failed");
	const done = new FakeWorker(self =>
		queueMicrotask(() => self.onmessage?.({ data: { ok: true, result: 1 } })),
	);
	expect(await offload(() => asWorker(done), null, { maxConcurrent: 1 })).toBe(1);
});

test("worker transport accepts legacy inputs and optional trace envelopes with unchanged replies", async () => {
	const scope = globalThis as unknown as Worker;
	const previousMessage = scope.onmessage;
	const previousPost = scope.postMessage;
	const replies: unknown[] = [];
	scope.postMessage = message => {
		replies.push(message);
	};
	try {
		serveWorker(async (input: number) => {
			if (input < 0) throw Object.assign(new Error("fixture failure"), { name: "FixtureError" });
			return input * 2;
		});
		await scope.onmessage!.call(scope, { data: 21 } as MessageEvent);
		await scope.onmessage!.call(scope, {
			data: {
				input: 7,
				telemetryContext: {
					traceparent: "00-11111111111111111111111111111111-2222222222222222-01",
					tracestate: "vendor=private",
				},
				type: "zaimu.compute",
			},
		} as MessageEvent);
		await scope.onmessage!.call(scope, { data: -1 } as MessageEvent);
		expect(replies).toEqual([
			{ ok: true, result: 42 },
			{ ok: true, result: 14 },
			{ error: { message: "fixture failure", name: "FixtureError" }, ok: false },
		]);
	} finally {
		scope.onmessage = previousMessage;
		scope.postMessage = previousPost;
	}
});

test("flush failures preserve the delivered result and always send cleanup control", async () => {
	const scope = globalThis as unknown as Worker;
	const previousMessage = scope.onmessage;
	const previousPost = scope.postMessage;
	const previousEnabled = process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
	const replies: unknown[] = [];
	scope.postMessage = message => {
		replies.push(message);
	};
	process.env.OTEL_EXPORTER_OTLP_ENDPOINT = "http://127.0.0.1:1";
	try {
		serveWorker(
			async () => 42,
			async () => {
				throw new Error("collector unavailable");
			},
		);
		await scope.onmessage!.call(scope, { data: null } as MessageEvent);
		expect(replies).toEqual([
			{ ok: true, result: 42, telemetryPending: true },
			{ type: "zaimu.compute.telemetry-flushed" },
		]);
	} finally {
		scope.onmessage = previousMessage;
		scope.postMessage = previousPost;
		if (previousEnabled === undefined) delete process.env.OTEL_EXPORTER_OTLP_ENDPOINT;
		else process.env.OTEL_EXPORTER_OTLP_ENDPOINT = previousEnabled;
	}
});
