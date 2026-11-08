import { decimalToUnits, unitsToDecimal } from "@zaimu/finance/asset-amount";
import { isCryptoAsset } from "@zaimu/finance/money";
import { resolveTransactionMoneySides } from "@zaimu/finance/transaction-money";

export async function resolveGuestTransactionMoneySides(
	input: Omit<
		Parameters<typeof resolveTransactionMoneySides>[0],
		"amount" | "destinationAmount" | "paymentAmount"
	> & {
		amount: number | string;
		destinationAmount?: number | string | null;
		paymentAmount?: number | string | null;
	},
	rate: Parameters<typeof resolveTransactionMoneySides>[1],
) {
	if (
		![input.currency, input.destinationCurrency, input.paymentCurrency].some(
			code => code && isCryptoAsset(code),
		)
	)
		return resolveTransactionMoneySides(
			{
				...input,
				amount: Number(input.amount),
				destinationAmount:
					input.destinationAmount == null
						? input.destinationAmount
						: Number(input.destinationAmount),
				paymentAmount:
					input.paymentAmount == null ? input.paymentAmount : Number(input.paymentAmount),
			},
			rate,
		);
	const side = (code?: string | null, value?: string | number | null) => {
		if (!code) {
			if (value != null) throw new Error("Valor efetivo exige destino");
			return null;
		}
		const amount = code === input.currency ? input.amount : value;
		if (amount == null) throw new Error("Informe os dois valores da conversão de ativos");
		if (isCryptoAsset(code) && typeof amount !== "string")
			throw new Error("Informe a quantidade crypto como decimal exato");
		const units = decimalToUnits(String(amount), code);
		if (units <= 0n) throw new Error("Informe um valor maior que zero");
		return isCryptoAsset(code) ? unitsToDecimal(units, code) : Number(unitsToDecimal(units, code));
	};
	return {
		conversionSource: "MANUAL" as const,
		destinationAmount: side(input.destinationCurrency, input.destinationAmount),
		destinationCurrency: input.destinationCurrency ?? null,
		paymentAmount: side(input.paymentCurrency, input.paymentAmount),
		paymentCurrency: input.paymentCurrency ?? null,
	};
}
