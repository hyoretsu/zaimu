import { t } from "elysia";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { convertCurrencyAmount } from "../infra/currency-exchange";
import { calculateFinancialFees } from "./financial-fees";

export const CurrencyDTO = t.String({ pattern: "^[A-Za-z]{3}$" });
export const FinancialFeeDTO = t.Object({
	amount: t.Number({ minimum: 0 }),
	name: t.String({ maxLength: 100, minLength: 1 }),
	type: t.Union([t.Literal("FIXED"), t.Literal("PERCENTAGE")]),
});
export type FinancialFee = typeof FinancialFeeDTO.static;
export async function financialAccountCurrency(accountId?: string | null) {
	if (!accountId) return "BRL";
	const [account] = await queryRaw<{ currency: string }>(
		`SELECT "currency" FROM "FinancialAccount" WHERE "id"=$1`,
		[accountId],
	);
	return account?.currency ?? "BRL";
}
export async function creditCardCurrency(cardId: string) {
	const [account] = await queryRaw<{ currency: string }>(
		`SELECT a."currency" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1`,
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
	const originalFeeAmount = calculateFinancialFees(input.amount, fees);
	const converted = await convert(
		input.amount + originalFeeAmount,
		input.date,
		currency,
		input.targetCurrency,
	);
	return {
		amount: converted.amount,
		currency,
		exchangeRate: converted.rate,
		feeAmount: Number((originalFeeAmount * converted.rate).toFixed(2)),
		fees,
		originalAmount: input.amount,
	};
}
