import { useQuery } from "@tanstack/react-query";
import {
	type FinancialRateRule,
	financialReferenceResolver,
	shiftMonths,
} from "@zaimu/finance/financial-indicators";
import { type LoanContractTerms, monthlyLoanRate } from "@zaimu/finance/loan-contract";
import { useMemo } from "react";
import { useHasAppSession } from "@/hooks/use-has-app-session";
import { loanContractsApi } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import type { PixCardOption } from "./PixCreditOfferCard";

const cdi: FinancialRateRule = { fixedPeriod: "MONTHLY", fixedRate: 0, indicator: "CDI", percentage: 100 };

/** Indicators are public; cards and loans only load with an app session. */
export function useLoanComparisonContext() {
	const hasSession = useHasAppSession();
	const identity = useCacheIdentity();
	const today = getLocalDateKey();
	const indicators = useQuery({
		queryFn: () => loanContractsApi.indicators(),
		queryKey: ["public", "loan-comparison-indicators"],
		retry: 1,
		staleTime: 60 * 60 * 1000,
	});
	const cards = useQuery({
		enabled: hasSession && !!identity,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: [...queryKeys.loans.all(identity!), "comparison-cards"],
	});
	const loans = useQuery({
		enabled: hasSession && !!identity,
		queryFn: () => dataService.loans.getAll(),
		queryKey: queryKeys.loans.list(identity!),
	});
	const reference = useMemo(
		() => (indicators.data ? financialReferenceResolver(indicators.data) : undefined),
		[indicators.data],
	);
	const projectedCdi = useMemo(() => {
		if (!reference) return null;
		try {
			const rate = monthlyLoanRate(
				{ rate: cdi } as LoanContractTerms,
				today,
				shiftMonths(today, 12),
				reference,
			);
			return Number.isFinite(rate) && rate > 0 ? rate : null;
		} catch {
			return null;
		}
	}, [reference, today]);
	const cardOptions = useMemo<PixCardOption[]>(
		() =>
			(cards.data ?? []).map(card => ({
				closingDay: card.statementDay,
				dueDay: card.dueDay,
				id: card.id,
				name: card.accountName || "Cartão",
			})),
		[cards.data],
	);
	return {
		cards: hasSession ? cardOptions : undefined,
		hasSession,
		indicatorsFailed: indicators.isError,
		loans: hasSession ? (loans.data ?? []) : [],
		projectedCdi,
		reference,
		today,
	};
}
