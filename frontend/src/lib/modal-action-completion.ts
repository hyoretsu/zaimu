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
const active = new Map<string, number>();

/** Mark an action of the group as in flight; the group refreshes only once none are. Returns an idempotent release. */
export function beginModalActionGroup(key: string): () => void {
	active.set(key, (active.get(key) ?? 0) + 1);
	let released = false;
	return () => {
		if (released) return;
		released = true;
		const count = (active.get(key) ?? 1) - 1;
		if (count) active.set(key, count);
		else active.delete(key);
		scheduleFlush(key);
	};
}

function scheduleFlush(key: string) {
	setTimeout(() => {
		const entries = groups.get(key);
		if (!entries || active.has(key)) return;
		groups.delete(key);
		void flush(entries);
	}, 0);
}

async function flush(entries: Completion[]) {
	try {
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
	} finally {
		for (const item of entries) item.resolve();
	}
}

/** Actions of a group settle together; refresh and notify once, after the last in-flight action ends. */
export function completeModalActionGroup(
	key: string,
	completion: Omit<Completion, "resolve">,
): Promise<void> {
	return new Promise(resolve => {
		const entry = { ...completion, resolve };
		const existing = groups.get(key);
		if (existing) existing.push(entry);
		else groups.set(key, [entry]);
		scheduleFlush(key);
	});
}
