export interface FinancialFee {
	name: string;
	amount: number;
	/** Asset the fee is paid in; absent means the transaction currency. */
	assetCode?: string;
	type: "FIXED" | "PERCENTAGE";
}

/** Percentages use the original principal, so fee ordering never compounds charges. */
export function calculateFinancialFees(
	principal: number,
	fees: readonly FinancialFee[],
	principalAsset?: string,
) {
	if (!Number.isFinite(principal) || principal <= 0) throw new RangeError("Valor inválido");
	return fees.reduce((sum, fee) => {
		if (
			!fee.name.trim() ||
			!Number.isFinite(fee.amount) ||
			fee.amount < 0 ||
			!["FIXED", "PERCENTAGE"].includes(fee.type)
		)
			throw new RangeError("Taxa inválida");
		// Fees in another asset (e.g. gas in ETH) are charged separately and never added to the principal.
		if (principalAsset && fee.assetCode && fee.assetCode.toUpperCase() !== principalAsset.toUpperCase())
			return sum;
		return sum + (fee.type === "PERCENTAGE" ? (principal * fee.amount) / 100 : fee.amount);
	}, 0);
}
