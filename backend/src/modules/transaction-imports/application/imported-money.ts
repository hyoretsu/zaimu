import { resolveTransactionMoneySides } from "@zaimu/finance/transaction-money";
import {
	creditCardCurrency,
	financialAccountCurrency,
	resolveFinancialMoney,
} from "~/modules/currencies/application/financial-money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
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
	>,
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
	return {
		bookingCurrency: currency,
		conversionSource: sides.conversionSource,
		currency,
		destinationAmount: sides.destinationAmount === null ? null : String(sides.destinationAmount),
		destinationCurrency: sides.destinationCurrency,
		exchangeRate: String(money.exchangeRate),
		originalAmount: String(money.originalAmount),
		paymentAmount: sides.paymentAmount === null ? null : String(sides.paymentAmount),
		paymentCurrency: sides.paymentCurrency,
	};
}
