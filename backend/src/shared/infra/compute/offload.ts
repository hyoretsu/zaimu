export class ComputeBusyError extends Error {
	constructor() {
		super("Servidor ocupado com outros cálculos pesados. Tente novamente em instantes.");
		this.name = "ComputeBusyError";
	}
}

export class ComputeTimeoutError extends Error {
	constructor(timeoutMs: number) {
		super(`O cálculo excedeu o limite de ${Math.round(timeoutMs / 1000)}s e foi interrompido.`);
		this.name = "ComputeTimeoutError";
	}
}

export type WorkerReply<Output> =
	{ ok: true; result: Output } | { ok: false; error: { message: string; name: string } };

export interface OffloadOptions {
	maxConcurrent?: number;
	timeoutMs?: number;
}

let running = 0;

/**
 * Runs CPU-bound work in a disposable worker thread so it can never block the API's event loop.
 * Work beyond `maxConcurrent` is rejected instead of queued, and a worker past its deadline is terminated.
 * `create` must instantiate the worker with a literal path so the bundler emits its entry.
 */
export async function offload<Input, Output>(
	create: () => Worker,
	input: Input,
	{
		maxConcurrent = Number(process.env.HEAVY_COMPUTE_MAX_CONCURRENT ?? 2),
		timeoutMs = Number(process.env.HEAVY_COMPUTE_TIMEOUT_MS ?? 90_000),
	}: OffloadOptions = {},
): Promise<Output> {
	if (running >= maxConcurrent) throw new ComputeBusyError();
	running++;
	const worker = create();
	try {
		return await new Promise<Output>((resolve, reject) => {
			const timer = setTimeout(() => reject(new ComputeTimeoutError(timeoutMs)), timeoutMs);
			worker.onmessage = (event: MessageEvent<WorkerReply<Output>>) => {
				clearTimeout(timer);
				if (event.data.ok) resolve(event.data.result);
				else
					reject(
						Object.assign(new Error(event.data.error.message), { name: event.data.error.name }),
					);
			};
			worker.onerror = event => {
				clearTimeout(timer);
				reject(new Error(event.message || "Falha no cálculo em segundo plano"));
			};
			worker.postMessage(input);
		});
	} finally {
		running--;
		worker.terminate();
	}
}

/** Worker-side wrapper: replies with the handler's result or a serializable error. */
export function serveWorker<Input, Output>(handler: (input: Input) => Promise<Output>) {
	const scope = globalThis as unknown as Worker;
	scope.onmessage = async (event: MessageEvent<Input>) => {
		try {
			scope.postMessage({ ok: true, result: await handler(event.data) } satisfies WorkerReply<Output>);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			scope.postMessage({
				error: { message: failure.message, name: failure.name },
				ok: false,
			} satisfies WorkerReply<Output>);
		}
	};
}
