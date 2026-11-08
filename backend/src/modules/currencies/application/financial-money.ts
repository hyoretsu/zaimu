import { decimalToUnits, unitsToDecimal } from "@zaimu/finance/asset-amount";
import { roundMoney, toMinorUnits } from "@zaimu/finance/money";
import { t } from "elysia";
import { resolveAccountAsset } from "~/modules/accounts/application/account-assets";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { convertAssetAmount } from "../infra/asset-exchange";
import { convertCurrencyAmount } from "../infra/currency-exchange";
import { calculateFinancialFees } from "./financial-fees";

export const CurrencyDTO = t.String({ pattern: "^[A-Za-z]{3}$" });
export const FinancialFeeDTO = t.Object({
	amount: t.Number({ minimum: 0 }),
	/** Asset the fee is paid in (e.g. gas in ETH); defaults to the transaction currency. */
	assetCode: t.Optional(t.String({ pattern: "^[A-Za-z0-9]{2,12}$" })),
	name: t.String({ maxLength: 100, minLength: 1 }),
	type: t.Union([t.Literal("FIXED"), t.Literal("PERCENTAGE")]),
});
export type FinancialFee = typeof FinancialFeeDTO.static;
export async function financialAccountCurrency(accountId?: string | null, requestedAsset?: string) {
	if (!accountId) return requestedAsset ?? "BRL";
	return (await resolveAccountAsset(accountId, requestedAsset, { create: true })).assetCode;
}
export async function creditCardCurrency(cardId: string) {
	const [account] = await queryRaw<{ currency: string }>(
		`SELECT c."currency" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1`,
		[cardId],
	);
	return account?.currency ?? "BRL";
}
export async function resolveFinancialMoney(
	input: {
		amount: number;
		currency?: string;
		targetCurrency: string;
		date: string | Date;
		fees?: FinancialFee[];
	},
	convert: typeof convertCurrencyAmount = convertCurrencyAmount,
) {
	const currency = (input.currency ?? input.targetCurrency).toUpperCase();
	const fees = input.fees ?? [];
	if (!Number.isFinite(input.amount) || input.amount <= 0)
		throw new HttpException("Informe um valor maior que zero", 400);
	toMinorUnits(input.amount, currency, 1);
	for (const fee of fees)
		if (fee.type === "FIXED") toMinorUnits(fee.amount, (fee.assetCode ?? currency).toUpperCase());
	const originalFeeAmount = calculateFinancialFees(input.amount, fees, currency);
	const converted = await convert(
		input.amount + originalFeeAmount,
		input.date,
		currency,
		input.targetCurrency,
	);
	return {
		amount: converted.amount,
		bookingCurrency: input.targetCurrency.toUpperCase(),
		currency,
		exchangeRate: converted.rate,
		feeAmount: roundMoney(originalFeeAmount * converted.rate, input.targetCurrency),
		fees,
		originalAmount: input.amount,
	};
}

export interface AssetFinancialFee {
	amount: string;
	assetCode?: string;
	name: string;
	type: "FIXED" | "PERCENTAGE";
}

/** Exact native transaction booking; third-asset gas stays a separate debit. */
export async function resolveAssetFinancialMoney(
	input: {
		amount: string;
		currency?: string;
		targetCurrency: string;
		date: string | Date;
		fees?: AssetFinancialFee[];
	},
	convert: typeof convertAssetAmount = convertAssetAmount,
) {
	const currency = (input.currency ?? input.targetCurrency).toUpperCase();
	const principal = decimalToUnits(input.amount, currency);
	if (principal <= 0n) throw new HttpException("Informe um valor maior que zero", 400);
	let nativeFees = 0n;
	const fees = input.fees ?? [];
	for (const fee of fees) {
		const asset = (fee.assetCode ?? currency).toUpperCase();
		if (fee.type === "PERCENTAGE") {
			if (asset !== currency || !/^\d+(?:\.\d{1,18})?$/.test(fee.amount))
				throw new HttpException("Taxa percentual inválida", 400);
			const [whole, fraction = ""] = fee.amount.split(".");
			const numerator = principal * BigInt(whole + fraction);
			const denominator = 100n * 10n ** BigInt(fraction.length);
			nativeFees += numerator / denominator + ((numerator % denominator) * 2n >= denominator ? 1n : 0n);
		} else {
			const value = decimalToUnits(fee.amount, asset);
			if (value < 0n) throw new HttpException("Taxa inválida", 400);
			if (asset === currency) nativeFees += value;
		}
	}
	const amount = await convert(
		unitsToDecimal(principal + nativeFees, currency),
		currency,
		input.targetCurrency,
		input.date,
	);
	const feeAmount =
		nativeFees === 0n
			? unitsToDecimal(0n, input.targetCurrency)
			: await convert(unitsToDecimal(nativeFees, currency), currency, input.targetCurrency, input.date);
	return {
		amount,
		bookingCurrency: input.targetCurrency.toUpperCase(),
		currency,
		exchangeRate: null,
		feeAmount,
		fees,
		originalAmount: unitsToDecimal(principal, currency),
	};
}

export async function resolveAssetTransactionMoneySides(input: {
	amount: string;
	currency: string;
	date: string | Date;
	destinationCurrency?: string | null;
	destinationAmount?: string | null;
	paymentCurrency?: string | null;
	paymentAmount?: string | null;
	explicitSides?: boolean;
}) {
	let manual = false;
	async function side(currency?: string | null, amount?: string | null) {
		if (!currency) {
			if (amount != null) throw new HttpException("Valor efetivo exige destino", 400);
			return null;
		}
		if (input.explicitSides && amount == null)
			throw new HttpException("Informe o valor equivalente da conversão de pontos", 400);
		if (amount != null) {
			const value = decimalToUnits(amount, currency);
			if (value <= 0n) throw new HttpException("A conversão deve usar valores maiores que zero", 400);
			manual = true;
			return unitsToDecimal(value, currency);
		}
		if (!input.explicitSides && currency === input.currency)
			return unitsToDecimal(decimalToUnits(input.amount, currency), currency);
		const converted = await convertAssetAmount(input.amount, input.currency, currency, input.date);
		if (decimalToUnits(converted, currency) <= 0n)
			throw new HttpException("Valor convertido abaixo da precisão do ativo", 400);
		return converted;
	}
	const destinationAmount = await side(input.destinationCurrency, input.destinationAmount);
	const paymentAmount = await side(input.paymentCurrency, input.paymentAmount);
	return {
		conversionSource: input.explicitSides
			? ("POINTS" as const)
			: manual
				? ("MANUAL" as const)
				: ("DAILY" as const),
		destinationAmount,
		destinationCurrency: input.destinationCurrency ?? null,
		paymentAmount,
		paymentCurrency: input.paymentCurrency ?? null,
	};
}
