import { roundMoney } from "@zaimu/finance/money";
import type { CreditCard } from "./api";
import { guestRate } from "./currency-conversion";
import { localAccounts, type StorageOwner } from "./localStorage";

export async function guestCashbackSnapshot(
	card: Partial<
		Pick<
			CreditCard,
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
