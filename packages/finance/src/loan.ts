export interface LoanTerms {
	principalAmount: number;
	interestRate: number;
	totalInstallments: number;
	firstDueDate: string;
	amortization: "PRICE" | "SAC" | "SACRE";
}
export function loanInstallments(loan: LoanTerms) {
	if (
		!Number.isSafeInteger(loan.totalInstallments) ||
		loan.totalInstallments < 1 ||
		loan.principalAmount <= 0 ||
		loan.interestRate < 0
	)
		throw new Error("Condições de empréstimo inválidas");
	if (loan.amortization === "SACRE") throw new Error("Amortização SACRE não suportada");
	let balance = loan.principalAmount;
	const rate = loan.interestRate;
	const fixed =
		rate === 0
			? balance / loan.totalInstallments
			: (balance * rate) / (1 - (1 + rate) ** -loan.totalInstallments);
	const anchor = new Date(`${loan.firstDueDate.slice(0, 10)}T12:00:00`);
	if (Number.isNaN(anchor.getTime())) throw new Error("Data de vencimento inválida");
	return Array.from({ length: loan.totalInstallments }, (_, index) => {
		const interestPaid = balance * rate;
		const principalPaid =
			loan.amortization === "PRICE"
				? fixed - interestPaid
				: loan.principalAmount / loan.totalInstallments;
		balance = Math.max(0, balance - principalPaid);
		const month = new Date(anchor.getFullYear(), anchor.getMonth() + index, 1, 12);
		month.setDate(
			Math.min(anchor.getDate(), new Date(month.getFullYear(), month.getMonth() + 1, 0).getDate()),
		);
		const dueDate = `${month.getFullYear()}-${String(month.getMonth() + 1).padStart(2, "0")}-${String(month.getDate()).padStart(2, "0")}`;
		return {
			dueDate,
			installmentNumber: index + 1,
			interestPaid,
			principalPaid,
			totalPaid: principalPaid + interestPaid,
		};
	});
}
