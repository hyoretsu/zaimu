import { toast, type ToastOptions } from "./toast";

interface Completion {
	success: boolean;
	message: string;
	errorOptions?: ToastOptions;
	refresh?: () => Promise<unknown>;
	current: () => boolean;
	resolve: () => void;
}
const groups = new Map<string, Completion[]>();

/** All promises in a transport batch settle together; refresh and notify once. */
export function completeModalActionGroup(
	key: string,
	completion: Omit<Completion, "resolve">,
): Promise<void> {
	return new Promise(resolve => {
		const existing = groups.get(key);
		const entry = { ...completion, resolve };
		if (existing) {
			existing.push(entry);
			return;
		}
		const entries = [entry];
		groups.set(key, entries);
		setTimeout(() => {
			groups.delete(key);
			void (async () => {
				const current = entries.filter(item => item.current());
				if (!current.length) return;
				const successes = current.filter(item => item.success);
				const failures = current.filter(item => !item.success);
				const latest = successes.at(-1) ?? failures.at(-1)!;
				try {
					await latest.refresh?.();
				} catch {
					if (latest.current())
						toast.error("Não foi possível atualizar a lista.", {
							action: {
								label: "Tentar atualizar",
								onClick: () => {
									if (latest.current())
										void latest
											.refresh?.()
											.catch(() => toast.error("Não foi possível atualizar a lista."));
								},
							},
						});
				}
				if (!latest.current()) return;
				if (successes.length)
					toast.success(
						current.length === 1
							? latest.message
							: `${successes.length} ${successes.length === 1 ? "ação concluída" : "ações concluídas"}.`,
					);
				if (failures.length) {
					const last = failures.at(-1)!;
					toast.error(
						failures.length === 1
							? last.message
							: `${failures.length} ações não concluídas. ${last.message}`,
						last.errorOptions,
					);
				}
			})().finally(() => {
				for (const item of entries) item.resolve();
			});
		}, 0);
	});
}
