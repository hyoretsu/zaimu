import { roundMoney, toMinorUnits } from "./money";

/** Same-currency payments have one amount; ignore stale hidden conversion fields. */
export function cardPaymentAmount(
	input: {
		amount: number | string;
		bookingCurrency?: string | null;
		conversionSource?: string | null;
		paymentAmount?: number | string | null;
		paymentCurrency?: string | null;
	},
	cardCurrency = input.paymentCurrency ?? "BRL",
) {
	return Number(
		input.conversionSource !== "POINTS" && (input.bookingCurrency ?? "BRL") === cardCurrency
			? input.amount
			: (input.paymentAmount ?? input.amount),
	);
}

export class TransactionMoneyError extends Error {}

export interface TransactionMoneySides {
	destinationAmount: number | null;
	destinationCurrency: string | null;
	paymentAmount: number | null;
	paymentCurrency: string | null;
	conversionSource: "MANUAL" | "DAILY" | "POINTS";
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
		/** A points account is on one side: units differ from money even in the same currency, so each side needs its own amount. */
		explicitSides?: boolean;
	},
	rate: (from: string, to: string) => Promise<number>,
): Promise<TransactionMoneySides> {
	let manual = false;
	async function side(currency?: string | null, amount?: number | null) {
		if (!currency) {
			if (amount != null) throw new Error("Valor efetivo exige conta ou cartão de destino");
			return null;
		}
		if (input.explicitSides) {
			if (amount == null)
				throw new TransactionMoneyError("Informe o valor equivalente da conversão de pontos");
			if (amount <= 0)
				throw new TransactionMoneyError("A conversão deve usar valores maiores que zero");
			toMinorUnits(amount, currency, 1);
			manual = true;
			return amount;
		}
		if (currency === input.currency) {
			toMinorUnits(input.amount, currency, 1);
			return input.amount;
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
		conversionSource: input.explicitSides ? "POINTS" : manual ? "MANUAL" : "DAILY",
		destinationAmount,
		destinationCurrency: input.destinationCurrency ?? null,
		paymentAmount,
		paymentCurrency: input.paymentCurrency ?? null,
	};
}
