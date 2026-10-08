import { currencyScale, fromMinorUnits, normalizeCurrency, toMinorUnits } from "./money";

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

/** A payment keeps the loan denomination and a separate actual debit in its account. */
export async function loanAccountAmounts(
	amounts: number[],
	currency: string,
	accountCurrency: string | null,
	actualTotal: number | undefined,
	rate: (from: string, to: string) => Promise<number>,
): Promise<(number | null)[]> {
	if (!amounts.length || amounts.some(amount => !Number.isFinite(amount) || amount < 0))
		throw new Error("Valores de parcela inválidos");
	if (!accountCurrency) {
		if (actualTotal !== undefined) throw new Error("Débito efetivo exige conta de pagamento");
		return amounts.map(() => null);
	}
	if (actualTotal === undefined) {
		const factor =
			currency === accountCurrency || amounts.every(amount => amount === 0)
				? 1
				: await rate(currency, accountCurrency);
		if (!Number.isFinite(factor) || factor <= 0) throw new Error("Conversão indisponível");
		return amounts.map(amount =>
			fromMinorUnits(Math.round(amount * factor * currencyScale(accountCurrency)), accountCurrency),
		);
	}
	const total = toMinorUnits(actualTotal, accountCurrency);
	const weight = amounts.reduce((sum, amount) => sum + amount, 0);
	if (!weight && total) throw new Error("Parcelas sem valor não podem receber débito");
	const exact = amounts.map(amount => (weight ? (total * amount) / weight : 0));
	const units = exact.map(value => Math.floor(value));
	const remaining = total - units.reduce((sum, value) => sum + value, 0);
	const order = exact
		.map((value, index) => ({ fraction: value - units[index]!, index }))
		.sort((a, b) => b.fraction - a.fraction || a.index - b.index);
	for (let index = 0; index < remaining; index++) units[order[index]!.index]!++;
	return units.map(value => fromMinorUnits(value, accountCurrency));
}
