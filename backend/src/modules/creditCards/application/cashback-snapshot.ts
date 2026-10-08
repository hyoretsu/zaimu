import { roundMoney } from "@zaimu/finance/money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
export interface CashbackCard {
	cashbackAccountId: string | null;
	cashbackRate: number | null;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage: number | null;
	cashbackYieldReferenceRate: number | null;
}
export async function rewardSnapshot(
	card: CashbackCard,
	total: number,
	source: string,
	date: string,
	userId: string,
) {
	const [account] = card.cashbackAccountId
		? await queryRaw<{ currency: string }>(
				'SELECT "currency" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2',
				[card.cashbackAccountId, userId],
			)
		: [];
	if (card.cashbackAccountId && !account) throw new HttpException("Conta de recompensa indisponível", 400);
	const currency = account?.currency ?? source;
	const rate =
		card.cashbackAccountId && card.cashbackRate && source !== currency
			? await ensureCurrencyRates(date, source, currency)
			: 1;
	return card.cashbackAccountId && card.cashbackRate
		? {
				cashbackAccountId: card.cashbackAccountId,
				cashbackAmount: roundMoney(((total * card.cashbackRate) / 100) * rate, currency),
				cashbackCurrency: currency,
				cashbackYieldPeriod: card.cashbackYieldPeriod,
				cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage,
				cashbackYieldReferenceRate: card.cashbackYieldReferenceRate,
			}
		: {};
}
