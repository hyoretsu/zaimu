import { roundMoney } from "@zaimu/finance/money";
import { cardRulesForPurchase } from "~/modules/accounts/application/institution-card-rules";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
import { HttpException } from "~/shared/errors";
import { db, queryFirst } from "~/shared/infra/sql";
export async function rewardSnapshot(
	input: { id: string },
	total: number,
	source: string,
	date: string,
	userId: string,
) {
	return snapshot(await rewardContext(input, source, date, userId), total);
}

/** One approval transaction may reuse the same effective policy and exchange quote. */
export function createRewardSnapshotLoader(loadContext: typeof rewardContext = rewardContext) {
	const contexts = new Map<string, ReturnType<typeof rewardContext>>();
	return async (...[input, total, source, date, userId]: Parameters<typeof rewardSnapshot>) => {
		const key = JSON.stringify([input.id, source, date, userId]);
		let context = contexts.get(key);
		if (!context) {
			context = loadContext(input, source, date, userId);
			contexts.set(key, context);
		}
		return snapshot(await context, total);
	};
}

async function rewardContext(input: { id: string }, source: string, date: string, userId: string) {
	const card = await cardRulesForPurchase(input.id, userId, date);
	const account = card.cashbackAccountId
		? await queryFirst(
				db.sql.public.FinancialAccount.select("currency")
					.where((fields, functions) =>
						functions.and(
							functions.eq(fields.id, card.cashbackAccountId!),
							functions.eq(fields.userId, userId),
						),
					)
					.limit(1)
					.build(),
			)
		: undefined;
	if (card.cashbackAccountId && !account) throw new HttpException("Conta de recompensa indisponível", 400);
	const currency = account?.currency ?? source;
	const rate =
		card.cashbackAccountId && card.cashbackRate && source !== currency
			? await ensureCurrencyRates(date, source, currency)
			: 1;
	return { card, currency, rate };
}

function snapshot({ card, currency, rate }: Awaited<ReturnType<typeof rewardContext>>, total: number) {
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
