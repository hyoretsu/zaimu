import { cardRulesForPurchase } from "~/modules/accounts/application/institution-card-rules";
import { convertAssetAmount } from "~/modules/currencies/infra/asset-exchange";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";

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
	const [account] = card.cashbackAccountId
		? await queryRaw<{ assetCode: string }>(
				`SELECT r."assetCode" FROM "RewardsAccount" r JOIN "FinancialAccount" a ON a.id=r."financialAccountId" JOIN "FinancialAccountAsset" h ON h."financialAccountId"=a.id AND h."assetCode"=r."assetCode" WHERE a.id=$1 AND a."userId"=$2`,
				[card.cashbackAccountId, userId],
			)
		: [];
	if (card.cashbackAccountId && !account) throw new HttpException("Conta de recompensa indisponível", 400);
	return { card, currency: account?.assetCode ?? source, date, source };
}

/** Fiat purchase inputs are numbers; multiplication starts from their decimal text. */
function rewardPrincipal(total: number, rate: number): string {
	if (!Number.isFinite(total) || total < 0 || !Number.isFinite(rate) || rate < 0)
		throw new HttpException("Valor de recompensa inválido", 400);
	const decimal = (value: number) => {
		const [coefficient, exponent = "0"] = String(value).toLowerCase().split("e");
		const [integer, fraction = ""] = coefficient.split(".");
		const scale = fraction.length - Number(exponent);
		return {
			digits: Math.max(scale, 0),
			units: BigInt(integer + fraction) * (scale < 0 ? 10n ** BigInt(-scale) : 1n),
		};
	};
	const left = decimal(total),
		right = decimal(rate);
	const digits = left.digits + right.digits + 2;
	const text = (left.units * right.units).toString().padStart(digits + 1, "0");
	return `${text.slice(0, -digits)}.${text.slice(-digits)}`;
}

async function snapshot(
	{ card, currency, source, date }: Awaited<ReturnType<typeof rewardContext>>,
	total: number,
) {
	if (!card.cashbackAccountId || !card.cashbackRate) return {};
	return {
		cashbackAccountId: card.cashbackAccountId,
		cashbackAmount: await convertAssetAmount(
			rewardPrincipal(total, card.cashbackRate),
			source,
			currency,
			date,
		),
		cashbackCurrency: currency,
		cashbackYieldPeriod: card.cashbackYieldPeriod,
		cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage,
		cashbackYieldReferenceRate: card.cashbackYieldReferenceRate,
	};
}
