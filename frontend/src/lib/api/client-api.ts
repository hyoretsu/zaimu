import {
	createClient,
	type RequestConfig as KubbRequestConfig,
	type ResponseConfig,
} from "@hyoretsu/kubb/client";
import ky, { type Options } from "ky";
import { useAuthStore } from "@/stores/auth";
import { activeCurrency } from "../currency-context";
import { getCurrentCacheIdentity } from "../query-cache";

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

export default async function client<TData, TError = unknown, TVariables = unknown>(
	config: RequestConfig<TVariables>,
	options?: Options,
): Promise<ResponseConfig<TData, TVariables>> {
	const identity = getCurrentCacheIdentity();
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
		if (getCurrentCacheIdentity() !== identity) throw new SessionChangedError();
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
		if (getCurrentCacheIdentity() !== identity) throw new SessionChangedError();
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
