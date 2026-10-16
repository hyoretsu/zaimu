import {
	type InstitutionCardRules,
	resolveInstitutionCardRules,
} from "@zaimu/finance/institution-card-rules";
import type { FinancialAccount } from "./api";
import { localAccounts, type StorageOwner } from "./localStorage";

export function localAccountCardRules(account: FinancialAccount | undefined, date?: string) {
	return resolveInstitutionCardRules(
		account?.institution,
		account?.cardRulesProfiles ?? account?.institution?.cardRulesProfiles,
		account?.institutionProfileChanges,
		date,
	);
}

const pendingRewards = new Map<string, Promise<string>>();
export async function localRuleRewardAccount(
	account: FinancialAccount,
	rules: InstitutionCardRules,
	owner?: StorageOwner,
): Promise<string | null> {
	if (!rules.cashback) return null;
	const reward = rules.cashback;
	const key = JSON.stringify([
		owner,
		account.userId,
		account.institutionId,
		account.currency,
		reward.kind,
		reward.conversionPoints,
		reward.conversionAmount,
	]);
	const pending = pendingRewards.get(key);
	if (pending) return pending;
	const create = async () => {
		const existing = (await localAccounts.getAll(owner))
			.map(row => row.data)
			.find(
				item =>
					item.type === "REWARDS" &&
					item.name === null &&
					item.institutionId === account.institutionId &&
					item.currency === account.currency &&
					item.rewardsAccount?.kind === reward.kind &&
					(item.rewardsAccount.conversionPoints ?? null) === reward.conversionPoints &&
					(item.rewardsAccount.conversionAmount ?? null) === reward.conversionAmount,
			);
		if (existing) return existing.id;
		const id = crypto.randomUUID();
		await localAccounts.put(
			{
				balance: 0,
				countryCode: account.countryCode,
				createdAt: new Date().toISOString(),
				currency: account.currency,
				id,
				institution: account.institution,
				institutionId: account.institutionId,
				name: null,
				rewardsAccount: {
					conversionAmount: reward.conversionAmount,
					conversionCurrency: account.currency,
					conversionPoints: reward.conversionPoints,
					financialAccountId: id,
					id: crypto.randomUUID(),
					initialBalance: 0,
					kind: reward.kind,
				},
				type: "REWARDS",
				updatedAt: new Date().toISOString(),
				userId: account.userId,
			},
			id,
			owner,
		);
		return id;
	};
	const result = create();
	pendingRewards.set(key, result);
	try {
		return await result;
	} finally {
		pendingRewards.delete(key);
	}
}
