import { propagation, ROOT_CONTEXT } from "@opentelemetry/api";
import { captureContext, enabled, operation } from "@zaimu/observability";

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
	| { ok: true; result: Output; telemetryPending?: true }
	| { ok: false; error: { message: string; name: string }; telemetryPending?: true };

interface WorkerRequest<Input> {
	type: "zaimu.compute";
	input: Input;
	telemetryContext: { traceparent: string };
}
interface WorkerControl {
	type: "zaimu.compute.telemetry-flushed";
}
// Retain at most maxConcurrent worker threads while exporters finish, without delaying results.
const telemetryGraceMs = 1000;

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
	let worker: Worker | undefined;
	let deferred = false;
	let terminated = false;
	let flushTimer: ReturnType<typeof setTimeout> | undefined;
	const terminate = () => {
		if (terminated) return;
		terminated = true;
		if (flushTimer) clearTimeout(flushTimer);
		running--;
		worker?.terminate();
	};
	try {
		worker = create();
		return await new Promise<Output>((resolve, reject) => {
			const timer = setTimeout(() => reject(new ComputeTimeoutError(timeoutMs)), timeoutMs);
			worker!.onmessage = (event: MessageEvent<WorkerReply<Output> | WorkerControl>) => {
				if ("type" in event.data && event.data.type === "zaimu.compute.telemetry-flushed") {
					if (deferred) terminate();
					return;
				}
				if (!("ok" in event.data)) return;
				clearTimeout(timer);
				if (event.data.telemetryPending) {
					deferred = true;
					flushTimer = setTimeout(terminate, telemetryGraceMs);
				}
				if (event.data.ok) resolve(event.data.result);
				else
					reject(
						Object.assign(new Error(event.data.error.message), { name: event.data.error.name }),
					);
			};
			worker!.onerror = event => {
				clearTimeout(timer);
				if (deferred) terminate();
				reject(new Error(event.message || "Falha no cálculo em segundo plano"));
			};
			const carrier = enabled() ? captureContext() : {};
			worker!.postMessage(
				carrier.traceparent
					? ({
							input,
							telemetryContext: { traceparent: carrier.traceparent },
							type: "zaimu.compute",
						} satisfies WorkerRequest<Input>)
					: input,
			);
		});
	} finally {
		if (!deferred) terminate();
	}
}

/** Worker-side wrapper: replies with the handler's result or a serializable error. */
export function serveWorker<Input, Output>(
	handler: (input: Input) => Promise<Output>,
	afterReply?: () => Promise<void>,
) {
	const scope = globalThis as unknown as Worker;
	scope.onmessage = /* @otel-ignore */ async (event: MessageEvent<Input | WorkerRequest<Input>>) => {
		const message = event.data;
		const wrapped =
			typeof message === "object" &&
			message !== null &&
			"type" in message &&
			message.type === "zaimu.compute" &&
			"input" in message &&
			"telemetryContext" in message;
		const input = wrapped ? (message as WorkerRequest<Input>).input : (message as Input);
		const traceparent = wrapped
			? (message as WorkerRequest<Input>).telemetryContext?.traceparent
			: undefined;
		const parent = propagation.extract(
			ROOT_CONTEXT,
			typeof traceparent === "string" ? { traceparent } : {},
		);
		const telemetryPending = enabled() && afterReply ? { telemetryPending: true as const } : {};
		try {
			const result = await operation("compute.process", () => handler(input), {}, parent);
			scope.postMessage({ ok: true, result, ...telemetryPending } satisfies WorkerReply<Output>);
		} catch (error) {
			const failure = error instanceof Error ? error : new Error(String(error));
			scope.postMessage({
				error: { message: failure.message, name: failure.name },
				ok: false,
				...telemetryPending,
			} satisfies WorkerReply<Output>);
		} finally {
			if (telemetryPending.telemetryPending) {
				try {
					await afterReply!();
				} catch {
					// Export failures never change an already delivered computation result.
				} finally {
					scope.postMessage({ type: "zaimu.compute.telemetry-flushed" } satisfies WorkerControl);
				}
			}
		}
	};
}
