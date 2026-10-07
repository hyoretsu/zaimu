export interface FinancialFee {
	name: string;
	amount: number;
	type: "FIXED" | "PERCENTAGE";
}

/** Percentages use the original principal, so fee ordering never compounds charges. */
export function calculateFinancialFees(principal: number, fees: readonly FinancialFee[]) {
	if (!Number.isFinite(principal) || principal <= 0) throw new RangeError("Valor inválido");
	return fees.reduce((sum, fee) => {
		if (
			!fee.name.trim() ||
			!Number.isFinite(fee.amount) ||
			fee.amount < 0 ||
			!["FIXED", "PERCENTAGE"].includes(fee.type)
		)
			throw new RangeError("Taxa inválida");
		return sum + (fee.type === "PERCENTAGE" ? (principal * fee.amount) / 100 : fee.amount);
	}, 0);
}
