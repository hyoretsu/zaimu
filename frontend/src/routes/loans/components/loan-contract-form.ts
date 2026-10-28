import type { LoanContractTerms } from "@zaimu/finance/loan-contract";
/** Read native fields at submission, including values still inside debounce windows. */
export function submittedNumber(form: HTMLFormElement, name: string, fallback: number): number {
	const value = new FormData(form).get(name);
	return value === null
		? fallback
		: Number(
				String(value)
					.replace(/[^\d,.-]/g, "")
					.replaceAll(".", "")
					.replace(",", "."),
			);
}
export function submittedLoanTerms(form: HTMLFormElement, draft: LoanContractTerms): LoanContractTerms {
	const number = (name: string, fallback: number) => submittedNumber(form, name, fallback);
	return {
		...draft,
		charges: draft.charges.map((row, index) => ({
			...row,
			amount: number(`charge-amount-${index}`, row.amount),
			name: String(new FormData(form).get(`charge-name-${index}`) ?? row.name).trim(),
		})),
		graceMonths: number("loan-grace", draft.graceMonths),
		lateFinePercent: number("loan-late-fine", draft.lateFinePercent),
		lateMonthlyPercent: number("loan-late-rate", draft.lateMonthlyPercent),
		manualSchedule: draft.manualSchedule?.map((row, index) => ({
			...row,
			charges: number(`manual-charges-${index}`, row.charges),
			interest: number(`manual-interest-${index}`, row.interest),
			principal: number(`manual-principal-${index}`, row.principal),
		})),
		principalAmount: number("loan-principal", draft.principalAmount),
		rate: {
			...draft.rate,
			fixedRate: number("loan-fixed-rate", draft.rate.fixedRate ?? 0),
			lagMonths: number("loan-index-lag", draft.rate.lagMonths ?? 0),
			percentage: draft.rate.indicator
				? number("loan-reference-percent", draft.rate.percentage ?? 100)
				: null,
		},
		totalInstallments: number("loan-installments", draft.totalInstallments),
	};
}
