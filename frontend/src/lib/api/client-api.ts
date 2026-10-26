import {
	createClient,
	type RequestConfig as KubbRequestConfig,
	type ResponseConfig,
} from "@hyoretsu/kubb/client";
import ky, { type Options } from "ky";
import { useAuthStore } from "@/stores/auth";
import { isBatchAction } from "../../../../shared/batch-policy";
import { activeCurrency } from "../currency-context";
import { getCurrentCacheIdentity } from "../query-cache";
import { ActionBatchQueue } from "./ActionBatchQueue";

export type { ResponseConfig, ResponseErrorConfig } from "@hyoretsu/kubb/client";
export type RequestConfig<TVariables = unknown> = KubbRequestConfig<TVariables> & {
	timeout?: Options["timeout"];
	authenticated?: boolean;
};
export type Client = typeof client;

export class ConnectivityError extends Error {}
export class SessionChangedError extends Error {
	constructor() {
		super("A sessão mudou durante a solicitação.");
	}
}

const transport = createClient(
	ky.extend({
		baseUrl: import.meta.env.VITE_API_URL || "http://localhost:3333",
		credentials: "include",
		// Resolve fetch at request time so tests and native transports can replace it.
		fetch: (input, options) => globalThis.fetch(input, options),
		retry: 0,
		timeout: false,
	}),
);

function isHttpError(error: unknown): error is { data: unknown; status: number } {
	return (
		typeof error === "object" && error !== null && "status" in error && typeof error.status === "number"
	);
}

const batchQueues = new Map<string, ActionBatchQueue>();
let sessionVersion = 0;
useAuthStore.subscribe((state, previous) => {
	if (
		state.user?.id === previous.user?.id &&
		state.isAuthenticated === previous.isAuthenticated &&
		state.isGuestMode === previous.isGuestMode &&
		state.guestId === previous.guestId
	)
		return;
	sessionVersion++;
	for (const queue of batchQueues.values()) queue.cancel(new SessionChangedError());
	batchQueues.clear();
});

/** Flush before a form/bulk action that could overlap queued list operations. */
export async function drainActionBatches(path?: string) {
	await Promise.all(
		[...batchQueues.values()]
			.filter(queue => !path || queue.hasConflict(path))
			.map(queue => queue.drain()),
	);
}

export default async function client<TData, TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
	options?: Options,
): Promise<ResponseConfig<TData, TVariables>> {
	const identity = getCurrentCacheIdentity();
	const version = sessionVersion;
	const headers = new Headers({ "X-Currency": activeCurrency() });
	new Headers(config.headers).forEach((value, name) => headers.set(name, value));
	const additionalHeaders = options?.headers;
	if (additionalHeaders instanceof Headers || Array.isArray(additionalHeaders))
		new Headers(additionalHeaders).forEach((value, name) => headers.set(name, value));
	else if (additionalHeaders)
		for (const [name, value] of Object.entries(additionalHeaders)) {
			if (value !== undefined) headers.set(name, value);
		}
	try {
		(options?.signal ?? config.signal)?.throwIfAborted();
		const method = (config.method ?? "GET").toUpperCase();
		const standardOptions =
			!options ||
			Object.keys(options).every(key => ["headers", "signal", "timeout", "credentials"].includes(key));
		if (
			isBatchAction(method, config.url) &&
			standardOptions &&
			(config.responseType === undefined || config.responseType === "json") &&
			!config.responseValidator &&
			!config.params &&
			!(config.data instanceof FormData) &&
			config.authenticated !== false
		) {
			const context = JSON.stringify([
				identity,
				version,
				[...headers.entries()].sort(),
				options?.timeout ?? config.timeout ?? false,
				options?.credentials ?? "include",
			]);
			let queue = batchQueues.get(context);
			if (!queue) {
				queue = new ActionBatchQueue(async operations => {
					if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
						throw new SessionChangedError();
					try {
						const envelope = await transport<string>(
							{
								data: { operations },
								headers,
								method: "POST",
								responseType: "text",
								url: "/batch",
							},
							{
								...options,
								headers,
								retry: 0,
								signal: undefined,
								timeout: options?.timeout ?? config.timeout ?? false,
							},
						);
						if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
							throw new SessionChangedError();
						return JSON.parse(envelope.data).results;
					} catch (error) {
						if (
							error instanceof SessionChangedError ||
							(isHttpError(error) && [400, 401, 403, 413, 422, 429].includes(error.status))
						)
							throw error;
						throw new ConnectivityError(
							"Resultado do lote não confirmado. Atualize os dados antes de tentar novamente.",
							{ cause: error },
						);
					}
				});
				batchQueues.set(context, queue);
			}
			const response = await queue.enqueue(
				{ body: config.data, id: crypto.randomUUID(), method, path: config.url },
				options?.signal ?? config.signal,
			);
			if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
				throw new SessionChangedError();
			if (response.status >= 400) throw { data: response.data, status: response.status };
			return { data: response.data as TData, status: response.status, statusText: "" };
		}
		if (!["GET", "HEAD", "OPTIONS"].includes(method)) {
			await drainActionBatches(config.url);
			if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
				throw new SessionChangedError();
		}
		const result = await transport<string, TError, TVariables>(
			{ ...config, headers, responseType: "text" },
			{
				...options,
				headers,
				retry: 0,
				signal: options?.signal ?? config.signal,
				// Explicit undefined resets Ky's instance default to its 10-second timeout.
				timeout: options?.timeout ?? config.timeout ?? false,
			},
		);
		if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
			throw new SessionChangedError();
		return {
			...result,
			data:
				config.responseType === "text"
					? result.data
					: result.data
						? JSON.parse(result.data)
						: undefined,
		};
	} catch (error) {
		// A late response must never log out or populate cache for a new identity.
		if (getCurrentCacheIdentity() !== identity || version !== sessionVersion)
			throw new SessionChangedError();
		if (isHttpError(error)) {
			if (error.status === 401 && config.authenticated !== false) {
				await useAuthStore.getState().logout();
				throw new Error("Sua sessão expirou. Entre novamente.");
			}
			if (error.status === 429)
				throw new Error("Muitas solicitações. Aguarde um instante e tente novamente.");
			const data = error.data;
			throw new Error(
				typeof data === "object" && data !== null && "error" in data && typeof data.error === "string"
					? data.error
					: `HTTP ${error.status}`,
			);
		}
		if (error instanceof TypeError)
			throw new ConnectivityError("Servidor indisponível.", { cause: error });
		throw error;
	}
}
