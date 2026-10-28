import { useEffect, useRef, useState } from "react";
import type { PlannerWorkerRequest, PlannerWorkerResponse } from "@/lib/loan-planner.worker";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
export function useLoanPlanner() {
	const identity = useCacheIdentity();
	const worker = useRef<Worker | null>(null);
	const revision = useRef(0);
	const [state, setState] = useState<{
		pending: boolean;
		progress?: PlannerWorkerResponse["progress"];
		result?: PlannerWorkerResponse["result"];
		error?: string;
	}>({ pending: false });
	useEffect(
		() => () => {
			revision.current++;
			worker.current?.terminate();
			worker.current = null;
		},
		[identity],
	);
	const cancel = () => {
		revision.current++;
		worker.current?.terminate();
		worker.current = null;
		setState({ pending: false });
	};
	const run = (request: Omit<PlannerWorkerRequest, "id">) => {
		worker.current?.terminate();
		const id = ++revision.current;
		const instance = new Worker(new URL("../lib/loan-planner.worker.ts", import.meta.url), {
			type: "module",
		});
		worker.current = instance;
		setState({ pending: true });
		instance.onmessage = (event: MessageEvent<PlannerWorkerResponse>) => {
			if (event.data.id !== revision.current) return;
			const response = event.data;
			if (response.result || response.error) {
				setState({ error: response.error, pending: false, result: response.result });
				showToast(
					response.error ? "Falha ao calcular previsão" : "Previsão concluída",
					response.error ? "negative" : "positive",
				);
				instance.terminate();
				worker.current = null;
			} else setState(old => ({ ...old, progress: response.progress }));
		};
		instance.onerror = () => {
			if (id !== revision.current) return;
			setState({ error: "Falha ao calcular previsão", pending: false });
			instance.terminate();
			worker.current = null;
		};
		instance.postMessage({ ...request, id });
	};
	return { ...state, cancel, run };
}
