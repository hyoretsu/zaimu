import { loanPlannerHorizon, type PlannerInput } from "@zaimu/finance/loan-planner";
import type { LoanPlannerSnapshot } from "@zaimu/finance/loan-planner-runtime";
import { useAuthStore } from "@/stores/auth";
import { loanContractsApi, type SavedLoanScenario } from "./api";
import { SessionChangedError } from "./api/client-api";
import { getGuestDashboardFinancialContext } from "./dashboard-comparison";
import { dataService } from "./dataService";
import { loanContractService, loanIndicatorContext } from "./loan-contract-service";
import { localFinancialDate, localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";
import { cachedTaxCatalog } from "./tax-catalog";
const owner = () => {
	const identity = getCurrentCacheIdentity();
	if (!identity) throw new Error("Sessão indisponível");
	return identity;
};
export const loanPlannerService = {
	async context(currency: string): Promise<LoanPlannerSnapshot> {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.context(currency);
		const identity = owner();
		const loans = await dataService.loans.getAll();
		const books = await Promise.all(
			loans.filter(row => !row.needsPaymentReview).map(row => loanContractService.get(row.id)),
		);
		const input: PlannerInput = {
			accounts: [],
			currency,
			dataIssues: loans.some(row => row.needsPaymentReview)
				? ["Há empréstimos com histórico pendente de revisão"]
				: [],
			eligibility: {
				accountIds: [],
				allAccounts: true,
				excludeAccountIds: [],
				includeAccountIds: [],
				includeInvestments: false,
			},
			from: await localFinancialDate(identity),
			loans: books.map(book => ({ book, paymentAccountId: "" })),
			movements: [],
			reserve: 0,
		};
		const through = loanPlannerHorizon(input);
		const context = await getGuestDashboardFinancialContext(
			{ endDate: through, periodsAfter: 0, periodsBefore: 0, startDate: input.from },
			through,
			true,
		);
		input.accounts = context.plannerAccounts.map(row => ({ ...row, balance: row.balance ?? 0 }));
		const primary =
			context.plannerAccounts.find(row => row.isPrimary)?.id ??
			input.accounts.find(row => ["CHECKING", "CASH"].includes(row.type))?.id ??
			"";
		input.primaryAccountId = primary;
		input.loans.forEach(row => {
			row.paymentAccountId = primary;
		});
		input.movements = context.plannerMovements;
		if (!context.consolidation.forecastAvailable)
			input.dataIssues.push("Cotações necessárias indisponíveis");
		let projections: LoanPlannerSnapshot["projections"] = [];
		let observations: LoanPlannerSnapshot["observations"] = {};
		try {
			const indicators = await loanIndicatorContext();
			projections = indicators.projections;
			observations = indicators.observations;
		} catch {
			if (
				context.plannerYieldAccounts.some(row => row.yieldReferenceType) ||
				books.some(row => row.versions.at(-1)!.terms.rate.indicator)
			)
				input.dataIssues.push("Histórico de cinco anos indisponível");
		}
		const conversionRates: Record<string, number | null> = {};
		for (const source of new Set([
			...input.accounts.map(row => row.currency ?? "BRL"),
			...input.movements.map(row => row.currency ?? "BRL"),
			...books.map(row => row.versions.at(-1)!.terms.currency),
		])) {
			try {
				conversionRates[source] = context.money.factor(source, input.from);
			} catch {
				conversionRates[source] = null;
			}
		}
		if (owner() !== identity) throw new SessionChangedError();
		return {
			capturedAt: new Date().toISOString(),
			conversionRates,
			holidays: context.plannerHolidays,
			input,
			observations,
			projections,
			taxDefinitions: cachedTaxCatalog(),
			yieldAccounts: context.plannerYieldAccounts,
		};
	},
	async remove(id: string) {
		if (!useAuthStore.getState().isGuestMode) {
			await loanContractsApi.deleteScenario(id);
			return;
		}
		const identity = owner();
		await localMeta.set(
			"loan-scenarios",
			(await this.scenarios()).filter(row => row.id !== id),
			identity,
		);
	},
	async save(row: Omit<SavedLoanScenario, "updatedAt">) {
		if (!useAuthStore.getState().isGuestMode) return loanContractsApi.saveScenario(row);
		const identity = owner();
		const rows = await this.scenarios();
		await localMeta.set(
			"loan-scenarios",
			[{ ...row, updatedAt: new Date().toISOString() }, ...rows.filter(old => old.id !== row.id)],
			identity,
		);
		return { id: row.id };
	},
	async scenarios(): Promise<SavedLoanScenario[]> {
		return useAuthStore.getState().isGuestMode
			? (((await localMeta.get("loan-scenarios", owner())) as SavedLoanScenario[] | undefined) ?? [])
			: loanContractsApi.scenarios();
	},
};
