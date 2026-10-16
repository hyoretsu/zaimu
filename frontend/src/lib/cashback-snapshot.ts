import { cardRuleValues } from "@zaimu/finance/institution-card-rules";
import { roundMoney } from "@zaimu/finance/money";
import type { CreditCard } from "./api";
import { guestRate } from "./currency-conversion";
import { localAccountCardRules, localRuleRewardAccount } from "./institution-card-rules";
import { localAccounts, type StorageOwner } from "./localStorage";

export async function guestCashbackSnapshot(
	card: Partial<
		Pick<
			CreditCard,
			| "financialAccountId"
			| "cashbackAccountId"
			| "cashbackRate"
			| "cashbackYieldPeriod"
			| "cashbackYieldReferencePercentage"
			| "cashbackYieldReferenceRate"
		>
	>,
	total: number,
	source: string,
	date: string,
	rate = guestRate,
	owner?: StorageOwner,
) {
	if (card.financialAccountId) {
		const sourceAccount = await localAccounts.getById(card.financialAccountId, owner);
		if (!sourceAccount) throw new Error("Conta do cartão indisponível");
		const rules = localAccountCardRules(sourceAccount.data, date);
		card = {
			...card,
			...cardRuleValues(rules),
			cashbackAccountId: await localRuleRewardAccount(sourceAccount.data, rules, owner),
		};
	}
	if (!card.cashbackAccountId || !card.cashbackRate) return {};
	const account = await localAccounts.getById(card.cashbackAccountId, owner);
	if (!account) throw new Error("Conta de recompensa indisponível");
	const currency = account.data.currency ?? "BRL";
	const factor = currency === source ? 1 : await rate(date, source, currency);
	return {
		cashbackAccountId: card.cashbackAccountId,
		cashbackAmount: roundMoney(((total * card.cashbackRate) / 100) * factor, currency),
		cashbackCurrency: currency,
		cashbackYieldPeriod: card.cashbackYieldPeriod ?? null,
		cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage ?? null,
		cashbackYieldReferenceRate: card.cashbackYieldReferenceRate ?? null,
	};
}
