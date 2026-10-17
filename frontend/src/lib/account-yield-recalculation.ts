import { historicalYieldOverride, settingsRequireReference } from "@zaimu/finance/projected-yield";
import type { FinancialAccount, FinancialAccountYield, FinancialAccountYieldRateHistory } from "./api";

export type CustomHistoricalYieldSettings = Omit<FinancialAccountYieldRateHistory, "effectiveDate">;

export function prepareGuestYieldRecalculation(
	account: FinancialAccount,
	profileId?: string,
	today = new Date().toLocaleDateString("sv-SE"),
	customSettings?: CustomHistoricalYieldSettings,
) {
	if (account.type === "CREDIT_CARD") throw new Error("Esta conta não permite recálculo de rendimento");
	const { settings } = historicalYieldOverride(
		{ ...account, institutionYieldPolicies: account.institution?.yieldPolicies },
		profileId,
		today,
		customSettings,
	);
	if (settingsRequireReference(settings))
		throw new Error("Recálculo com CDI ou SELIC exige histórico oficial disponível em uma conta conectada");
	return { settings, today };
}

export function preserveAdjustedAccountYields(yields: FinancialAccountYield[], accountId: string) {
	return yields.filter(
		entry =>
			entry.financialAccountId !== accountId ||
			entry.kind !== "AUTOMATIC" ||
			entry.origin !== "SYSTEM" ||
			entry.isExcluded,
	);
}

export async function recalculateAccountYield(
	accountId: string,
	profileId?: string,
	customSettings?: CustomHistoricalYieldSettings,
): Promise<{ success: true }> {
	const { useAuthStore } = await import("@/stores/auth");
	if (!useAuthStore.getState().isGuestMode) {
		const { postFinancialAccountsByIdRecalculateYields } = await import("./api");
		return postFinancialAccountsByIdRecalculateYields(accountId, {
			customSettings: customSettings
				? { ...customSettings, yieldTaxIds: customSettings.yieldTaxIds ?? undefined }
				: undefined,
			profileId,
		});
	}
	const { localAccounts, localMeta } = await import("./localStorage");
	const stored = await localAccounts.getById(accountId);
	if (!stored) throw new Error("Conta não encontrada");
	const { settings, today } = prepareGuestYieldRecalculation(
		stored.data,
		profileId,
		undefined,
		customSettings,
	);
	const yields = ((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
	const updated: FinancialAccount = {
		...stored.data,
		historicalYieldSettings: { settings, throughDate: today },
		updatedAt: new Date().toISOString(),
	};
	await localAccounts.put(updated, accountId);
	await localMeta.set("financial-account-yields", preserveAdjustedAccountYields(yields, accountId));
	return { success: true };
}
