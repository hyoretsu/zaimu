import { createElement } from "react";
import { type ExternalToast, toast as sonner, type ToastT } from "sonner";

type Message = Parameters<typeof sonner>[0];
export type ToastOptions = ExternalToast & { dedupeKey?: string };
type Kind = "message" | "success" | "info" | "warning" | "error" | "loading";
const active = new Map<string | number, { key?: string; loading: boolean }>();
// IDs belong to operations. A late completion must never resurrect a dismissed operation.
const dismissed = new Set<string | number>();
const idPrefix = `${crypto.randomUUID()}:`;
let sequence = 0;
export const MAX_TOASTS = 5;

export function notificationMessage(message: Message): Message {
	if (typeof message !== "string") return message;
	if (/timed?\s*out|timeout/i.test(message)) return "A operação demorou demais. Tente novamente.";
	if (/failed to fetch|networkerror|network request failed/i.test(message))
		return "Não foi possível conectar. Verifique sua conexão e tente novamente.";
	return message;
}

function forget(id: string | number) {
	if (active.get(id)?.loading && !(typeof id === "string" && id.startsWith(idPrefix))) dismissed.add(id);
	active.delete(id);
}

function emit(kind: Kind, message: Message, options: ToastOptions = {}) {
	const { dedupeKey, ...data } = options;
	if (typeof data.id === "string" && data.id.startsWith(idPrefix) && !active.has(data.id)) return data.id;
	if (data.id !== undefined && dismissed.has(data.id)) {
		if (kind !== "loading") dismissed.delete(data.id);
		return data.id;
	}
	const title = notificationMessage(message);
	const key = dedupeKey ?? (kind === "error" && typeof title === "string" ? title : undefined);
	const duplicate = key ? [...active].find(([, entry]) => entry.key === key)?.[0] : undefined;
	const id = duplicate ?? data.id ?? `${idPrefix}${++sequence}`;
	if (duplicate !== undefined && data.id !== undefined && data.id !== duplicate) {
		forget(data.id);
		sonner.dismiss(data.id);
	}
	if (!active.has(id) && active.size >= MAX_TOASTS) {
		const oldest = active.keys().next().value!;
		forget(oldest);
		sonner.dismiss(oldest);
	}
	const wasLoading = active.get(id)?.loading;
	active.set(id, { key, loading: kind === "loading" });
	const dismiss = (item: ToastT) => {
		forget(item.id);
		data.onDismiss?.(item);
	};
	const autoClose = (item: ToastT) => {
		forget(item.id);
		data.onAutoClose?.(item);
	};
	const settings: ExternalToast = {
		...data,
		action:
			data.action && typeof data.action === "object" && "onClick" in data.action
				? {
						...data.action,
						onClick: event => {
							if (data.action && typeof data.action === "object" && "onClick" in data.action)
								data.action.onClick(event);
							if (!event.defaultPrevented) forget(id);
						},
					}
				: data.action,
		cancel:
			data.cancel && typeof data.cancel === "object" && "onClick" in data.cancel
				? {
						...data.cancel,
						onClick: event => {
							if (data.cancel && typeof data.cancel === "object" && "onClick" in data.cancel)
								data.cancel.onClick(event);
							forget(id);
						},
					}
				: data.cancel,
		closeButton: undefined,
		dismissible: true,
		duration:
			kind === "loading"
				? Number.POSITIVE_INFINITY
				: (data.duration ?? (wasLoading ? 4000 : undefined)),
		icon:
			kind === "loading"
				? createElement("span", {
						"aria-hidden": true,
						className:
							"size-4 animate-spin rounded-full border-2 border-current border-t-transparent",
					})
				: data.icon,
		id,
		onAutoClose: autoClose,
		onDismiss: dismiss,
		position: "top-center",
	};
	return (kind === "loading" ? sonner.message : sonner[kind])(title, settings);
}

const notify = (message: Message, options?: ToastOptions) => emit("message", message, options);
export const toast = Object.assign(notify, {
	dismiss: (id?: string | number) => {
		if (id === undefined) {
			for (const key of active.keys()) forget(key);
		} else forget(id);
		return sonner.dismiss(id);
	},
	error: (message: Message, options?: ToastOptions) => emit("error", message, options),
	getHistory: sonner.getHistory,
	getToasts: sonner.getToasts,
	info: (message: Message, options?: ToastOptions) => emit("info", message, options),
	loading: (message: Message, options?: ToastOptions) => emit("loading", message, options),
	message: notify,
	promise: <T>(
		operation: Promise<T> | (() => Promise<T>),
		options: {
			loading?: Message;
			success?: Message | ((value: T) => Message);
			error?: Message | ((error: unknown) => Message);
			finally?: () => void;
		} & ToastOptions = {},
	) => {
		const id = options.id ?? crypto.randomUUID();
		if (options.loading !== undefined) emit("loading", options.loading, { ...options, id });
		const result = Promise.resolve().then(() =>
			typeof operation === "function" ? operation() : operation,
		);
		void result
			.then(
				value => {
					if (options.success !== undefined)
						emit(
							"success",
							typeof options.success === "function" ? options.success(value) : options.success,
							{ ...options, id },
						);
					else toast.dismiss(id);
				},
				error => {
					if (options.error !== undefined)
						emit(
							"error",
							typeof options.error === "function" ? options.error(error) : options.error,
							{ ...options, id },
						);
					else toast.dismiss(id);
				},
			)
			.finally(options.finally)
			.catch(() => undefined);
		return { unwrap: () => result };
	},
	success: (message: Message, options?: ToastOptions) => emit("success", message, options),
	warning: (message: Message, options?: ToastOptions) => emit("warning", message, options),
});
