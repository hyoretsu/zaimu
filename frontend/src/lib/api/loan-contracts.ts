import type {
	FinancialIndicator,
	IndicatorObservation,
	IndicatorProjection,
} from "@zaimu/finance/financial-indicators";
import type {
	LoanContractBook,
	LoanContractTerms,
	LoanSimulation,
	LoanSimulationInput,
} from "@zaimu/finance/loan-contract";
import type { LoanPlannerSnapshot } from "@zaimu/finance/loan-planner-runtime";
import client from "./client-api";
import type { FinancialInstitution } from "./domain";
export interface LoanBooking {
	id: string;
	accountId: string | null;
	accountAmount: number | null;
}
export interface SavedLoanScenario {
	id: string;
	name: string;
	parameters: unknown;
	summary: unknown;
	updatedAt: string;
}
export interface IndicatorContext {
	projections: IndicatorProjection[];
	observations: Record<FinancialIndicator, IndicatorObservation[]>;
}
async function request<T>(
	method: "GET" | "POST" | "PATCH" | "DELETE",
	url: string,
	data?: unknown,
	authenticated = true,
): Promise<T> {
	return (await client<T, unknown, unknown>({ authenticated, data, method, url })).data;
}
export const loanContractsApi = {
	context: (currency: string) =>
		request<LoanPlannerSnapshot>(
			"GET",
			`/loans/planner/context?currency=${encodeURIComponent(currency)}`,
		),
	create: (input: {
		institutionId: string;
		terms: LoanContractTerms;
		description?: string;
		disbursementTransactionId?: string;
		disbursementAccountId?: string;
	}) => request<LoanContractBook>("POST", "/loans/contracts", input),
	deleteScenario: (id: string) =>
		request<{ success: boolean }>("DELETE", `/loans/scenarios/${encodeURIComponent(id)}`),
	execute: (id: string, simulation: LoanSimulation, booking: LoanBooking) =>
		request<LoanContractBook>("POST", `/loans/${encodeURIComponent(id)}/execute`, {
			booking,
			simulation,
		}),
	get: (id: string) => request<LoanContractBook>("GET", `/loans/${encodeURIComponent(id)}/contract`),
	indicators: () => request<IndicatorContext>("GET", "/reference-rates/indicators", undefined, false),
	pay: (
		id: string,
		input: {
			expectedRevision: number;
			date: string;
			amount: number;
			installmentIds?: string[];
			booking: LoanBooking;
		},
	) => request<LoanContractBook>("POST", `/loans/${encodeURIComponent(id)}/receipts`, input),
	publicInstitutions: () =>
		request<FinancialInstitution[]>("GET", "/financial-institutions/catalog", undefined, false),
	restructure: (
		id: string,
		input: {
			institutionId: string;
			terms: LoanContractTerms;
			expectedRevision: number;
			kind: "RENEGOTIATE" | "PORTABILITY";
			settlementAmount: number;
		},
	) =>
		request<{ source: LoanContractBook; successor: LoanContractBook }>(
			"POST",
			`/loans/${encodeURIComponent(id)}/restructure`,
			input,
		),
	reverse: (id: string, input: { expectedRevision: number; receiptId: string; id: string; date: string }) =>
		request<LoanContractBook>("POST", `/loans/${encodeURIComponent(id)}/reverse`, input),
	saveScenario: (input: Omit<SavedLoanScenario, "updatedAt">) =>
		request<{ id: string }>("POST", "/loans/scenarios", input),
	scenarios: () => request<SavedLoanScenario[]>("GET", "/loans/scenarios"),
	simulate: (id: string, input: LoanSimulationInput) =>
		request<LoanSimulation>("POST", `/loans/${encodeURIComponent(id)}/simulate`, input),
	update: (
		id: string,
		input: {
			institutionId: string;
			terms: LoanContractTerms;
			expectedRevision: number;
			effectiveDate: string;
		},
	) => request<LoanContractBook>("PATCH", `/loans/${encodeURIComponent(id)}/contract`, input),
};
