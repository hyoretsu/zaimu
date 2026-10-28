import {
	financialReferenceResolver,
	type IndicatorObservation,
	type IndicatorProjection,
} from "./financial-indicators";
import type { PlannerInput, PlannerRuntime } from "./loan-planner";
import {
	getYieldSettings,
	projectedNetYield,
	type ReferenceRateType,
	settingsRequireReference,
	type YieldAccount,
} from "./projected-yield";
import { setTaxDefinitions, type TaxDefinition } from "./yield-tax";
export interface LoanPlannerSnapshot {
	input: PlannerInput;
	yieldAccounts: YieldAccount[];
	projections: IndicatorProjection[];
	observations?: Record<string, IndicatorObservation[]>;
	holidays: Record<string, string[]>;
	conversionRates: Record<string, number | null>;
	taxDefinitions: TaxDefinition[];
	capturedAt: string;
}
export function loanPlannerRuntime(snapshot: LoanPlannerSnapshot): PlannerRuntime {
	setTaxDefinitions(snapshot.taxDefinitions);
	const accounts = new Map(snapshot.yieldAccounts.map(row => [row.id, row]));
	const holidays = new Map(Object.entries(snapshot.holidays).map(([id, dates]) => [id, new Set(dates)]));
	const averages: Partial<Record<ReferenceRateType, number>> = {};
	for (const row of snapshot.projections)
		if (row.complete && row.periodRate !== null) averages[row.indicator] = row.periodRate;
	const reference = financialReferenceResolver({
		observations: snapshot.observations ?? {},
		projections: snapshot.projections,
	});
	return {
		netYield: (account, balance, day, ledger) => {
			const settings = accounts.get(account.id);
			const active = settings ? getYieldSettings(settings, day) : undefined;
			if (settings && settingsRequireReference(active)) {
				const rules = active && "rules" in active ? active.rules : active ? [active] : [];
				for (const rule of rules)
					if (rule.yieldReferenceType && averages[rule.yieldReferenceType] === undefined)
						throw new Error("Histórico de cinco anos indisponível para rendimento");
			}
			return settings
				? projectedNetYield(settings, balance, day, averages, holidays.get(account.id), ledger)
				: 0;
		},
		rate: currency =>
			currency === snapshot.input.currency ? 1 : (snapshot.conversionRates[currency] ?? null),
		reference,
		settleYield: (account, amount, day, ledger) => {
			const settings = accounts.get(account.id);
			ledger.accrueRecordedNet(amount, settings ? getYieldSettings(settings, day) : undefined, day);
		},
	};
}
