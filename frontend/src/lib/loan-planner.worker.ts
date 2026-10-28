/// <reference lib="webworker" />
import {
	baselineLoanScenario,
	evaluateLoanScenario,
	type PlannerScenario,
	rankLoanScenarios,
	searchLoanScenarios,
} from "@zaimu/finance/loan-planner";
import { loanPlannerRuntime, type LoanPlannerSnapshot } from "@zaimu/finance/loan-planner-runtime";
export interface PlannerWorkerRequest {
	id: number;
	snapshot: LoanPlannerSnapshot;
	accountId: string;
	budget: number;
	scenario?: PlannerScenario;
}
export interface PlannerWorkerResponse {
	id: number;
	progress?: { done: number; total: number };
	result?: Awaited<ReturnType<typeof searchLoanScenarios>>;
	error?: string;
}
self.onmessage = async (event: MessageEvent<PlannerWorkerRequest>) => {
	const { id, snapshot, accountId, budget, scenario } = event.data;
	try {
		const runtime = loanPlannerRuntime(snapshot);
		const result = scenario
			? (() => {
					const baseline = evaluateLoanScenario(snapshot.input, baselineLoanScenario, runtime);
					return {
						baseline,
						dates: [snapshot.input.from],
						evaluated: 1,
						ranked: rankLoanScenarios([
							baseline,
							evaluateLoanScenario(snapshot.input, scenario, runtime, baseline),
						]),
					};
				})()
			: await searchLoanScenarios(snapshot.input, {
					accountId,
					budget,
					onProgress: (done, total) =>
						self.postMessage({ id, progress: { done, total } } satisfies PlannerWorkerResponse),
					runtime,
				});
		self.postMessage({ id, result } satisfies PlannerWorkerResponse);
	} catch (error) {
		self.postMessage({
			error: error instanceof Error ? error.message : "Falha na previsão",
			id,
		} satisfies PlannerWorkerResponse);
	}
};
