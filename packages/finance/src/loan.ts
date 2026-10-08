import { fromMinorUnits, normalizeCurrency, toMinorUnits } from "./money";

export interface LoanTerms {
	principalAmount: number;
	currency?: string;
	interestRate: number;
	totalInstallments: number;
	firstDueDate: string;
	amortization: "PRICE" | "SAC";
}
export function loanInstallments(loan: LoanTerms) {
	if (
		!Number.isSafeInteger(loan.totalInstallments) ||
		loan.totalInstallments < 1 ||
		loan.totalInstallments > 1200 ||
		!Number.isFinite(loan.principalAmount) ||
		!Number.isFinite(loan.interestRate) ||
		loan.principalAmount <= 0 ||
		loan.interestRate < 0
	)
		throw new Error("Condições de empréstimo inválidas");
	if (loan.amortization !== "PRICE" && loan.amortization !== "SAC") throw new Error("Amortização inválida");
	const currency = normalizeCurrency(loan.currency ?? "BRL");
	const principalUnits = toMinorUnits(loan.principalAmount, currency, 1);
	let balance = principalUnits;
	const rate = loan.interestRate;
	const fixed = Math.round(
		rate === 0
			? balance / loan.totalInstallments
			: (balance * rate) / (1 - (1 + rate) ** -loan.totalInstallments),
	);
	const anchor = new Date(`${loan.firstDueDate.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(anchor.getTime())) throw new Error("Data de vencimento inválida");
	return Array.from({ length: loan.totalInstallments }, (_, index) => {
		const interestUnits = Math.round(balance * rate);
		const distributedPrincipal =
			Math.floor(principalUnits / loan.totalInstallments) +
			(index < principalUnits % loan.totalInstallments ? 1 : 0);
		const principal =
			index === loan.totalInstallments - 1
				? balance
				: Math.min(
						balance,
						Math.max(
							0,
							loan.amortization === "PRICE" ? fixed - interestUnits : distributedPrincipal,
						),
					);
		balance -= principal;
		const principalPaid = fromMinorUnits(principal, currency);
		const interestPaid = fromMinorUnits(interestUnits, currency);
		const month = new Date(anchor.getFullYear(), anchor.getMonth() + index, 1, 12);
		month.setDate(
			Math.min(anchor.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()),
		);
		const dueDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(month.getDate()).padStart(2, "0")}`;
		return {
			currency,
			dueDate,
			installmentNumber: index + 1,
			interestPaid,
			principalPaid,
			totalPaid: fromMinorUnits(principal + interestUnits, currency),
		};
	});
}
