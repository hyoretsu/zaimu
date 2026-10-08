import { roundMoney, toMinorUnits } from "./money";

export interface TransactionMoneySides {
	destinationAmount: number | null;
	destinationCurrency: string | null;
	paymentAmount: number | null;
	paymentCurrency: string | null;
	conversionSource: "MANUAL" | "DAILY";
}

/** Resolve each native book independently; never reinterpret the debit as the credit. */
export async function resolveTransactionMoneySides(
	input: {
		amount: number;
		currency: string;
		destinationCurrency?: string | null;
		destinationAmount?: number | null;
		paymentCurrency?: string | null;
		paymentAmount?: number | null;
	},
	rate: (from: string, to: string) => Promise<number>,
): Promise<TransactionMoneySides> {
	let manual = false;
	async function side(currency?: string | null, amount?: number | null) {
		if (!currency) {
			if (amount != null) throw new Error("Valor efetivo exige conta ou cartão de destino");
			return null;
		}
		if (amount != null) {
			toMinorUnits(amount, currency, 1);
			manual = true;
			return amount;
		}
		const factor = currency === input.currency ? 1 : await rate(input.currency, currency);
		if (!Number.isFinite(factor) || factor <= 0) throw new Error("Conversão indisponível");
		const converted = roundMoney(input.amount * factor, currency);
		toMinorUnits(converted, currency, 1);
		return converted;
	}
	const destinationAmount = await side(input.destinationCurrency, input.destinationAmount);
	const paymentAmount = await side(input.paymentCurrency, input.paymentAmount);
	return {
		conversionSource: manual ? "MANUAL" : "DAILY",
		destinationAmount,
		destinationCurrency: input.destinationCurrency ?? null,
		paymentAmount,
		paymentCurrency: input.paymentCurrency ?? null,
	};
}
