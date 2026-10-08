import { resolveTransactionMoneySides } from "@zaimu/finance/transaction-money";
import {
	creditCardCurrency,
	financialAccountCurrency,
	resolveFinancialMoney,
} from "~/modules/currencies/application/financial-money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
import { queryRaw } from "~/shared/infra/sql";
import type { ImportItemToApprove } from "./import-service";
export async function importedMoney(
	item: Pick<
		ImportItemToApprove,
		| "amount"
		| "date"
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
	const originalAmount = source && Number(source.amount) > 0 ? Number(source.amount) : money.originalAmount;
	const sourceCurrency = source?.currency ?? currency;
	return {
		bookingCurrency: currency,
		conversionSource: sides.conversionSource,
		currency: sourceCurrency,
		destinationAmount: sides.destinationAmount === null ? null : String(sides.destinationAmount),
		destinationCurrency: sides.destinationCurrency,
		exchangeRate: String(money.amount / originalAmount),
		originalAmount: String(originalAmount),
		paymentAmount: sides.paymentAmount === null ? null : String(sides.paymentAmount),
		paymentCurrency: sides.paymentCurrency,
	};
}
