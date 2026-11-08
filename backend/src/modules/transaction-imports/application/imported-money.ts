import { resolveTransactionMoneySides } from "@zaimu/finance/transaction-money";
import { calculateFinancialFees } from "~/modules/currencies/application/financial-fees";
import {
	creditCardCurrency,
	financialAccountCurrency,
	type FinancialFee,
	resolveFinancialMoney,
} from "~/modules/currencies/application/financial-money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
import { nullableNumeric, numeric, queryRaw } from "~/shared/infra/sql";
import type { ImportItemToApprove } from "./import-service";
export async function importedMoney(
	item: Pick<
		ImportItemToApprove,
		| "amount"
		| "date"
		| "destinationAmount"
		| "fees"
		| "type"
		| "destinationFinancialAccountId"
		| "originFinancialAccountId"
		| "paymentCreditCardId"
	> & { id?: string },
	dependencies = { creditCardCurrency, ensureCurrencyRates, financialAccountCurrency },
) {
	const currency = await dependencies.financialAccountCurrency(
		item.type === "INCOME" || item.type === "YIELD"
			? item.destinationFinancialAccountId
			: item.originFinancialAccountId,
	);
	const money = await resolveFinancialMoney({
		amount: item.amount,
		date: item.date,
		targetCurrency: currency,
	});
	const sides = await resolveTransactionMoneySides(
		{
			amount: money.amount,
			currency,
			destinationAmount: item.destinationAmount == null ? null : Number(item.destinationAmount),
			destinationCurrency: item.destinationFinancialAccountId
				? await dependencies.financialAccountCurrency(item.destinationFinancialAccountId)
				: null,
			paymentCurrency: item.paymentCreditCardId
				? await dependencies.creditCardCurrency(item.paymentCreditCardId)
				: null,
		},
		(from, to) => dependencies.ensureCurrencyRates(item.date, from, to),
	);
	const [source] = item.id
		? await queryRaw<{ currency: string; amount: number }>(
				`SELECT "snapshot"->>'currency' AS currency, abs(("snapshot"->>'amount')::numeric) AS amount FROM "OpenFinanceRecord" WHERE "reviewItemId"=$1 LIMIT 1`,
				[item.id],
			)
		: [];
	const sourceAmount = source && Number(source.amount) > 0 ? Number(source.amount) : money.originalAmount;
	const sourceCurrency = source?.currency ?? currency;
	// The statement amount is the whole debit: fees (e.g. IOF) are part of it, the principal excludes them.
	const fees = (Array.isArray(item.fees) ? item.fees : []) as FinancialFee[];
	const originalAmount = sourceAmount - calculateFinancialFees(sourceAmount, fees, sourceCurrency);
	return {
		bookingCurrency: currency,
		conversionSource: sides.conversionSource,
		currency: sourceCurrency,
		destinationAmount: nullableNumeric(sides.destinationAmount),
		destinationCurrency: sides.destinationCurrency,
		exchangeRate: numeric(money.amount / sourceAmount),
		fees: fees.map(fee => ({ ...fee })),
		originalAmount: numeric(originalAmount),
		paymentAmount: nullableNumeric(sides.paymentAmount),
		paymentCurrency: sides.paymentCurrency,
	};
}
