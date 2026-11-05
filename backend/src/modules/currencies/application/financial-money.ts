import { roundMoney, toMinorUnits } from "@zaimu/finance/money";
import { t } from "elysia";
import { HttpException } from "~/shared/errors";
import { db, queryFirst, queryRaw } from "~/shared/infra/sql";
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
export async function financialAccountCurrency(accountId?: string | null, fallback = "BRL") {
	if (!accountId) return fallback;
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("currency")
			.where((fields, functions) => functions.eq(fields.id, accountId))
			.limit(1)
			.build(),
	);
	return account?.currency ?? "BRL";
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
