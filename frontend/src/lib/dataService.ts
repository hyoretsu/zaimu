/**
 * Data Service - Abstracts local vs remote data operations
 *
 * When in guest mode: All operations use IndexedDB
 * When authenticated: Operations use backend API with local caching
 */

import { useAuthStore } from "@/stores/auth";
import type {
	Category,
	CreditCard,
	CreditCardImport,
	CreditCardImportCreateResult,
	CreditCardImportItem,
	CreditCardStatement,
	CreditCardStatementDetail,
	CreditPurchase,
	Dashboard,
	Debt,
	DebtInvitation,
	DebtLedger,
	DebtPerson,
	DebtSplit,
	DebtSplitInput,
	FinancialAccount,
	FinancialAccountYield,
	FinancialAccountYieldHoliday,
	FinancialAccountYieldRateHistory,
	FinancialInstitution,
	Loan,
	RecurringPayment,
	Salary,
	Store,
	Subscription,
	Transaction,
	TransactionImport,
	TransactionImportCreateResult,
	TransactionImportItem,
} from "./api";
import { applyStatementCredits } from "./credit-card";
import { getCurrentLocalTime, getLocalDateKey } from "./date";
import { calculateDebtSplit } from "./debt-split";
import { calculateFinancialAccountBalances } from "./financial-account";
import { normalizeInstitutionName } from "./financial-institution";
import {
	clearAllLocalData,
	localAccounts,
	localCategories,
	localCreditCardStatements,
	localCreditCards,
	localCreditPurchases,
	localDebtPeople,
	localDebts,
	localLoans,
	localMeta,
	localRecurringPayments,
	localSalaries,
	localStores,
	localSubscriptions,
	localTransactions,
} from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";
import { sortTransactionsByMostRecent } from "./transaction-sort";
import { assertFileIsAccessible } from "./upload-file";

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";
const REQUEST_TIMEOUT_MS = 10_000;

function getEvenlyDistributedInstallmentAmounts(totalAmount: number, installments: number) {
	const totalInCents = Math.round(totalAmount * 100);
	const amountInCents = Math.floor(totalInCents / installments);
	const remainderInCents = totalInCents % installments;
	return Array.from(
		{ length: installments },
		(_, index) => (amountInCents + (index < remainderInCents ? 1 : 0)) / 100,
	);
}

type LegacySalary = Omit<Salary, "amount"> & {
	amount?: number;
	grossAmount?: number;
	netAmount?: number;
};

function normalizeSalary(salary: LegacySalary): Salary {
	const normalized = { ...salary, amount: salary.amount ?? salary.netAmount ?? 0 };
	delete normalized.grossAmount;
	delete normalized.netAmount;
	return normalized;
}

async function hydrateLocalDebtSplit(
	amount: number,
	input?: DebtSplitInput | null,
): Promise<DebtSplit | null | undefined> {
	if (input === undefined) return undefined;
	if (input === null) return null;
	const calculated = calculateDebtSplit(amount, input);
	if (!calculated) throw new Error("O rateio da dívida não fecha com o valor total.");
	const people = await localDebtPeople.getAll();
	const names = new Map(people.map(person => [person.data.id, person.data.name]));
	return {
		...calculated,
		participants: calculated.participants.map(participant => ({
			...participant,
			debtPersonName: names.get(participant.debtPersonId) ?? "Pessoa",
		})),
	} as DebtSplit;
}

export type FinancialAccountDraft = Omit<
	FinancialAccount,
	| "balance"
	| "createdAt"
	| "creditCard"
	| "id"
	| "institution"
	| "institutionId"
	| "rewardsAccount"
	| "updatedAt"
	| "userId"
> & {
	creditCard?: Pick<
		CreditCard,
		| "cashbackAccountId"
		| "cashbackRate"
		| "cashbackYieldPeriod"
		| "cashbackYieldReferencePercentage"
		| "cashbackYieldReferenceRate"
		| "creditLimit"
		| "dueDay"
		| "excludeFromTotals"
		| "securityDeposit"
		| "statementDay"
		| "workingDueDate"
	> & {
		cashbackRewards?: {
			conversionAmount?: number;
			conversionPoints?: number;
			kind: "CASHBACK" | "POINTS";
		};
	};
	institutionName?: string;
	rewardsAccount?: Pick<
		NonNullable<FinancialAccount["rewardsAccount"]>,
		"conversionAmount" | "conversionPoints" | "initialBalance" | "kind"
	>;
};

export interface FinancialAccountUpdateDraft {
	creditCard?: FinancialAccountDraft["creditCard"];
	institutionName?: string;
	name?: string | null;
	recalculateCurrentDay?: boolean;
	rewardsAccount?: FinancialAccountDraft["rewardsAccount"];
	yieldPeriod?: FinancialAccount["yieldPeriod"];
	yieldFixedRate?: FinancialAccount["yieldFixedRate"];
	yieldReferencePercentage?: FinancialAccount["yieldReferencePercentage"];
	yieldReferenceType?: FinancialAccount["yieldReferenceType"];
	yieldTaxRate?: FinancialAccount["yieldTaxRate"];
}

// Check if we're in guest mode or authenticated
function isGuestMode(): boolean {
	const state = useAuthStore.getState();
	return state.isGuestMode;
}

function getUserId(): string {
	const state = useAuthStore.getState();
	return state.user?.id || state.guestId;
}

type LegacyFinancialAccount = FinancialAccount & {
	yieldRate?: number | null;
	yieldRateHistories?: Array<FinancialAccountYieldRateHistory & { yieldRate?: number | null }>;
};
type LegacyCreditCard = CreditCard & { cashbackYieldRate?: number | null };
type LegacyCreditPurchase = CreditPurchase & { cashbackYieldRate?: number | null };

function normalizeLegacyCreditCard(card: LegacyCreditCard): CreditCard {
	const referenceRate = card.cashbackYieldReferenceRate ?? card.cashbackYieldRate;
	return {
		...card,
		cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage ?? (referenceRate ? 100 : null),
		cashbackYieldReferenceRate: referenceRate,
	};
}

function normalizeLegacyCreditPurchase(purchase: LegacyCreditPurchase): CreditPurchase {
	const referenceRate = purchase.cashbackYieldReferenceRate ?? purchase.cashbackYieldRate;
	return {
		...purchase,
		cashbackYieldReferencePercentage:
			purchase.cashbackYieldReferencePercentage ?? (referenceRate ? 100 : null),
		cashbackYieldReferenceRate: referenceRate,
	};
}

function normalizeLegacyFinancialAccount(account: LegacyFinancialAccount): FinancialAccount {
	return {
		...account,
		...(account.creditCard && { creditCard: normalizeLegacyCreditCard(account.creditCard) }),
		yieldFixedRate: account.yieldFixedRate ?? account.yieldRate,
		yieldRateHistories: account.yieldRateHistories?.map(history => {
			const legacyHistory = history as FinancialAccountYieldRateHistory & { yieldRate?: number | null };
			return {
				...history,
				yieldFixedRate: history.yieldFixedRate ?? legacyHistory.yieldRate,
			};
		}),
	};
}

// Generic authenticated fetch
async function fetchWithAuth<T>(endpoint: string, options: RequestInit = {}): Promise<T> {
	const requestIdentity = getCurrentCacheIdentity();
	const controller = new AbortController();
	const abortRequest = () => controller.abort(options.signal?.reason);
	const timeoutId = window.setTimeout(() => controller.abort(), REQUEST_TIMEOUT_MS);
	options.signal?.addEventListener("abort", abortRequest, { once: true });
	let response: Response;
	try {
		response = await fetch(`${API_URL}${endpoint}`, {
			...options,
			credentials: "include",
			headers: {
				...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
				...options.headers,
			},
			signal: controller.signal,
		});
	} catch (error) {
		if (controller.signal.aborted && !options.signal?.aborted)
			throw new ConnectivityError("A solicitação demorou demais. Tente novamente.", { cause: error });
		throw new ConnectivityError("Servidor indisponível.", { cause: error });
	} finally {
		window.clearTimeout(timeoutId);
		options.signal?.removeEventListener("abort", abortRequest);
	}

	if (!response.ok) {
		if (response.status === 401) {
			await useAuthStore.getState().logout();
			throw new Error("Sua sessão expirou. Entre novamente.");
		}
		if (response.status === 429)
			throw new Error("Muitas solicitações. Aguarde um instante e tente novamente.");
		const error = await response.json().catch(() => ({ error: "Erro desconhecido" }));
		throw new Error(error.error || `HTTP ${response.status}`);
	}

	const result = (await response.json()) as T;
	if (getCurrentCacheIdentity() !== requestIdentity) throw new SessionChangedError();
	return result;
}

class ConnectivityError extends Error {}

class SessionChangedError extends Error {
	constructor() {
		super("A sessão mudou durante a solicitação.");
	}
}

function isConnectivityError(error: unknown): boolean {
	return error instanceof ConnectivityError;
}

function cacheRemoteData(operation: Promise<unknown>): void {
	void operation.catch(() => undefined);
}

// ============== ACCOUNTS ==============
export const dataService = {
	accounts: {
		async create(data: FinancialAccountDraft): Promise<FinancialAccount> {
			const userId = getUserId();
			if (isGuestMode()) {
				const { creditCard, institutionName, rewardsAccount, ...accountData } = data;
				let institution: FinancialInstitution | null = null;
				const normalizedInstitutionName = normalizeInstitutionName(institutionName ?? "");
				if (normalizedInstitutionName) {
					const storedAccounts = await localAccounts.getAll();
					institution =
						storedAccounts
							.map(item => item.data.institution)
							.find(item => item && normalizeInstitutionName(item.name) === normalizedInstitutionName) ??
						null;
					institution ??= {
						id: crypto.randomUUID(),
						name: institutionName!.normalize("NFKC").trim().replace(/\s+/gu, " "),
					};
				}
				const now = new Date();
				let newAccount: FinancialAccount = {
					...accountData,
					balance: data.type === "CREDIT_CARD" ? null : 0,
					createdAt: now.toISOString(),
					id: crypto.randomUUID(),
					institution,
					institutionId: institution?.id ?? null,
					updatedAt: now.toISOString(),
					userId,
					...(data.yieldPeriod && {
						yieldRateHistories: [
							{
								effectiveDate: getLocalDateKey(now),
								yieldFixedRate: data.yieldFixedRate,
								yieldPeriod: data.yieldPeriod,
								yieldReferencePercentage: data.yieldReferencePercentage,
								yieldReferenceType: data.yieldReferenceType,
								yieldTaxRate: data.yieldTaxRate,
							},
						],
					}),
				};
				if (data.type === "REWARDS" && rewardsAccount) {
					newAccount = {
						...newAccount,
						rewardsAccount: {
							...rewardsAccount,
							conversionAmount: rewardsAccount.conversionAmount ?? null,
							conversionPoints: rewardsAccount.conversionPoints ?? null,
							financialAccountId: newAccount.id,
							id: crypto.randomUUID(),
						},
					};
				}
				await localAccounts.put(newAccount, newAccount.id);
				if (data.type === "CREDIT_CARD" && creditCard) {
					if (creditCard.cashbackRate && !creditCard.cashbackAccountId && creditCard.cashbackRewards) {
						const matchingReward = (await localAccounts.getAll())
							.map(item => item.data)
							.find(
								item =>
									item.type === "REWARDS" &&
									item.institutionId === newAccount.institutionId &&
									item.name === null,
							);
						if (matchingReward) creditCard.cashbackAccountId = matchingReward.id;
						else {
							const rewardAccount: FinancialAccount = {
								balance: 0,
								createdAt: new Date().toISOString(),
								id: crypto.randomUUID(),
								institution: newAccount.institution,
								institutionId: newAccount.institutionId,
								name: null,
								rewardsAccount: {
									...creditCard.cashbackRewards,
									conversionAmount: creditCard.cashbackRewards.conversionAmount ?? null,
									conversionPoints: creditCard.cashbackRewards.conversionPoints ?? null,
									financialAccountId: "",
									id: crypto.randomUUID(),
									initialBalance: 0,
								},
								type: "REWARDS",
								updatedAt: new Date().toISOString(),
								userId,
							};
							rewardAccount.rewardsAccount!.financialAccountId = rewardAccount.id;
							await localAccounts.put(rewardAccount, rewardAccount.id);
							creditCard.cashbackAccountId = rewardAccount.id;
						}
					}
					const card = await dataService.creditCards.createFromAccount(newAccount, creditCard);
					newAccount = { ...newAccount, creditCard: card };
					await localAccounts.put(newAccount, newAccount.id);
				}
				return newAccount;
			}
			const account = await fetchWithAuth<FinancialAccount>("/financial-accounts", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localAccounts.put(account, account.id);
			return account;
		},

		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				await localAccounts.delete(id);
				return;
			}
			await fetchWithAuth(`/financial-accounts/${id}`, { method: "DELETE" });
			await localAccounts.delete(id);
		},
		async getAll(): Promise<FinancialAccount[]> {
			if (isGuestMode()) {
				const [local, transactions, cashbackPurchases, holidays, yields] = await Promise.all([
					localAccounts.getAll(),
					localTransactions.getAll(),
					localCreditPurchases.getAll(),
					localMeta.get("financial-account-yield-holidays"),
					localMeta.get("financial-account-yields"),
				]);
				return calculateFinancialAccountBalances(
					local.map(item => normalizeLegacyFinancialAccount(item.data)),
					transactions.map(item => item.data),
					cashbackPurchases.map(item => normalizeLegacyCreditPurchase(item.data)),
					(holidays as FinancialAccountYieldHoliday[] | null)?.map(holiday => holiday.date) ?? [],
					undefined,
					(yields as FinancialAccountYield[] | null) ?? [],
				);
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const accounts = await fetchWithAuth<FinancialAccount[]>("/financial-accounts");
			cacheRemoteData(
				localAccounts.replaceSnapshot(
					accounts.map(a => ({ data: a, localId: a.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return accounts;
		},

		async getById(id: string): Promise<FinancialAccount | null> {
			if (isGuestMode()) {
				return (await this.getAll()).find(account => account.id === id) ?? null;
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			try {
				return await fetchWithAuth<FinancialAccount>(`/financial-accounts/${id}`);
			} catch (error) {
				if (!isConnectivityError(error) || getCurrentCacheIdentity() !== owner) throw error;
				// Fallback to local cache
				const local = await localAccounts.getById(id, owner);
				return local?.data || null;
			}
		},

		async update(id: string, data: FinancialAccountUpdateDraft): Promise<FinancialAccount> {
			if (isGuestMode()) {
				const existing = await localAccounts.getById(id);
				if (!existing) throw new Error("FinancialAccount not found");
				existing.data = normalizeLegacyFinancialAccount(existing.data);
				const { institutionName, recalculateCurrentDay, ...accountData } = data;
				let institution = existing.data.institution ?? null;
				if (institutionName !== undefined) {
					const normalizedName = normalizeInstitutionName(institutionName);
					institution = normalizedName
						? ((await localAccounts.getAll())
								.map(item => item.data.institution)
								.find(item => item && normalizeInstitutionName(item.name) === normalizedName) ?? {
								id: crypto.randomUUID(),
								name: institutionName.normalize("NFKC").trim().replace(/\s+/gu, " "),
							})
						: null;
				}
				const yieldChanged =
					data.yieldPeriod !== undefined ||
					data.yieldFixedRate !== undefined ||
					data.yieldReferencePercentage !== undefined ||
					data.yieldReferenceType !== undefined ||
					data.yieldTaxRate !== undefined;
				const effectiveDate = new Date();
				if (!recalculateCurrentDay) effectiveDate.setDate(effectiveDate.getDate() + 1);
				const effectiveDateKey = getLocalDateKey(effectiveDate);
				const nextYieldHistory = yieldChanged
					? [
							...(existing.data.yieldRateHistories ?? []).filter(
								history => history.effectiveDate.slice(0, 10) < effectiveDateKey,
							),
							{
								effectiveDate: effectiveDateKey,
								yieldFixedRate:
									data.yieldFixedRate === undefined ? existing.data.yieldFixedRate : data.yieldFixedRate,
								yieldPeriod: data.yieldPeriod === undefined ? existing.data.yieldPeriod : data.yieldPeriod,
								yieldReferencePercentage:
									data.yieldReferencePercentage === undefined
										? existing.data.yieldReferencePercentage
										: data.yieldReferencePercentage,
								yieldReferenceType:
									data.yieldReferenceType === undefined
										? existing.data.yieldReferenceType
										: data.yieldReferenceType,
								yieldTaxRate:
									data.yieldTaxRate === undefined ? existing.data.yieldTaxRate : data.yieldTaxRate,
							},
						]
					: existing.data.yieldRateHistories;
				const updated: FinancialAccount = {
					...existing.data,
					...accountData,
					creditCard:
						data.creditCard && existing.data.creditCard
							? { ...existing.data.creditCard, ...data.creditCard }
							: existing.data.creditCard,
					institution,
					institutionId: institution?.id ?? null,
					rewardsAccount:
						data.rewardsAccount && existing.data.rewardsAccount
							? { ...existing.data.rewardsAccount, ...data.rewardsAccount }
							: existing.data.rewardsAccount,
					updatedAt: new Date().toISOString(),
					yieldRateHistories: nextYieldHistory,
				};
				await localAccounts.put(updated, id);
				if (yieldChanged && recalculateCurrentDay) {
					const yields =
						((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
					await localMeta.set(
						"financial-account-yields",
						yields.filter(
							yieldEntry =>
								yieldEntry.financialAccountId !== id ||
								yieldEntry.kind !== "AUTOMATIC" ||
								yieldEntry.date.slice(0, 10) !== effectiveDateKey,
						),
					);
				}
				return updated;
			}
			const account = await fetchWithAuth<FinancialAccount>(`/financial-accounts/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localAccounts.put(account, account.id);
			return account;
		},
	},

	accountYieldHolidays: {
		async create(date: string): Promise<FinancialAccountYieldHoliday> {
			if (!isGuestMode()) {
				return fetchWithAuth<FinancialAccountYieldHoliday>("/financial-account-yield-holidays", {
					body: JSON.stringify({ date }),
					method: "POST",
				});
			}
			const existing =
				((await localMeta.get("financial-account-yield-holidays")) as
					| FinancialAccountYieldHoliday[]
					| null) ?? [];
			const holiday = existing.find(item => item.date.slice(0, 10) === date);
			if (holiday) return holiday;
			const created = { date, id: crypto.randomUUID() };
			await localMeta.set("financial-account-yield-holidays", [...existing, created]);
			return created;
		},
		async delete(id: string): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/financial-account-yield-holidays/${id}`, { method: "DELETE" });
				return;
			}
			const existing =
				((await localMeta.get("financial-account-yield-holidays")) as
					| FinancialAccountYieldHoliday[]
					| null) ?? [];
			await localMeta.set(
				"financial-account-yield-holidays",
				existing.filter(holiday => holiday.id !== id),
			);
		},
		async getAll(): Promise<FinancialAccountYieldHoliday[]> {
			if (isGuestMode())
				return (
					((await localMeta.get("financial-account-yield-holidays")) as
						| FinancialAccountYieldHoliday[]
						| null) ?? []
				);
			return fetchWithAuth<FinancialAccountYieldHoliday[]>("/financial-account-yield-holidays");
		},
	},

	accountYields: {
		async create(data: {
			amount: number;
			date: string;
			financialAccountId: string;
		}): Promise<FinancialAccountYield> {
			if (!isGuestMode()) {
				return fetchWithAuth<FinancialAccountYield>("/financial-account-yields", {
					body: JSON.stringify({ ...data, kind: "MANUAL" }),
					method: "POST",
				});
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			const existing = yields.find(
				yieldEntry =>
					yieldEntry.financialAccountId === data.financialAccountId &&
					yieldEntry.date.slice(0, 10) === data.date &&
					yieldEntry.kind === "MANUAL",
			);
			const created: FinancialAccountYield = {
				amount: data.amount,
				date: data.date,
				financialAccountId: data.financialAccountId,
				id: existing?.id ?? crypto.randomUUID(),
				isExcluded: false,
				kind: "MANUAL",
			};
			await localMeta.set(
				"financial-account-yields",
				existing
					? yields.map(yieldEntry => (yieldEntry.id === existing.id ? created : yieldEntry))
					: [...yields, created],
			);
			return created;
		},
		async delete(id: string): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/financial-account-yields/${id}`, { method: "DELETE" });
				return;
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			await localMeta.set(
				"financial-account-yields",
				yields.filter(yieldEntry => yieldEntry.id !== id),
			);
		},
		async getAll(financialAccountId: string): Promise<FinancialAccountYield[]> {
			if (!isGuestMode())
				return fetchWithAuth<FinancialAccountYield[]>(
					`/financial-account-yields?financialAccountId=${encodeURIComponent(financialAccountId)}`,
				);
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			return yields.filter(yieldEntry => yieldEntry.financialAccountId === financialAccountId);
		},
		async update(id: string, amount: number): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/financial-account-yields/${id}`, {
					body: JSON.stringify({ amount }),
					method: "PATCH",
				});
				return;
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			await localMeta.set(
				"financial-account-yields",
				yields.map(yieldEntry => (yieldEntry.id === id ? { ...yieldEntry, amount } : yieldEntry)),
			);
		},
		async upsertAutomatic(data: {
			amount?: number;
			date: string;
			financialAccountId: string;
			isExcluded?: boolean;
		}): Promise<FinancialAccountYield> {
			if (!isGuestMode()) {
				return fetchWithAuth<FinancialAccountYield>("/financial-account-yields", {
					body: JSON.stringify({ ...data, kind: "AUTOMATIC" }),
					method: "POST",
				});
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			const existing = yields.find(
				yieldEntry =>
					yieldEntry.financialAccountId === data.financialAccountId &&
					yieldEntry.date.slice(0, 10) === data.date &&
					yieldEntry.kind === "AUTOMATIC",
			);
			const saved: FinancialAccountYield = {
				amount: data.isExcluded ? null : (data.amount ?? null),
				date: data.date,
				financialAccountId: data.financialAccountId,
				id: existing?.id ?? crypto.randomUUID(),
				isExcluded: data.isExcluded ?? false,
				kind: "AUTOMATIC",
			};
			await localMeta.set(
				"financial-account-yields",
				existing
					? yields.map(yieldEntry => (yieldEntry.id === existing.id ? saved : yieldEntry))
					: [...yields, saved],
			);
			return saved;
		},
	},

	// ============== CATEGORIES ==============
	categories: {
		async create(data: Omit<Category, "id" | "userId">): Promise<Category> {
			const userId = getUserId();
			if (isGuestMode()) {
				const newCategory: Category = {
					...data,
					id: crypto.randomUUID(),
					userId,
				};
				await localCategories.put(newCategory, newCategory.id);
				return newCategory;
			}
			const category = await fetchWithAuth<Category>("/categories", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localCategories.put(category, category.id);
			return category;
		},

		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				await localCategories.delete(id);
				return;
			}
			await fetchWithAuth(`/categories/${id}`, { method: "DELETE" });
			await localCategories.delete(id);
		},
		async getAll(): Promise<Category[]> {
			if (isGuestMode()) {
				const local = await localCategories.getAll();
				return local.map(item => item.data);
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const categories = await fetchWithAuth<Category[]>("/categories");
			cacheRemoteData(
				localCategories.replaceSnapshot(
					categories.map(c => ({ data: c, localId: c.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return categories;
		},

		async update(id: string, data: Partial<Category>): Promise<Category> {
			if (isGuestMode()) {
				const existing = await localCategories.getById(id);
				if (!existing) throw new Error("Category not found");
				const updated: Category = { ...existing.data, ...data };
				await localCategories.put(updated, id);
				return updated;
			}
			const category = await fetchWithAuth<Category>(`/categories/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localCategories.put(category, category.id);
			return category;
		},
	},

	creditCardImports: {
		async approve(id: string): Promise<{ created: number }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			return fetchWithAuth<{ created: number }>(`/credit-card-imports/${id}/approve`, { method: "POST" });
		},
		async approveItem(importId: string, itemId: string): Promise<{ created: number }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			return fetchWithAuth<{ created: number }>(`/credit-card-imports/${importId}/items/${itemId}/approve`, {
				method: "POST",
			});
		},
		async create({
			creditCardId,
			file,
			password,
			provider,
		}: {
			creditCardId: string;
			file: File;
			password?: string;
			provider: CreditCardImport["provider"];
		}): Promise<CreditCardImportCreateResult> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			await assertFileIsAccessible(file);
			const form = new FormData();
			form.set("creditCardId", creditCardId);
			form.set("file", file);
			if (password) form.set("password", password);
			form.set("provider", provider);
			return fetchWithAuth<CreditCardImportCreateResult>("/credit-card-imports", {
				body: form,
				method: "POST",
			});
		},
		async delete(id: string): Promise<void> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			await fetchWithAuth(`/credit-card-imports/${id}`, { method: "DELETE" });
		},
		async get(id: string): Promise<CreditCardImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			return fetchWithAuth<CreditCardImport>(`/credit-card-imports/${id}`);
		},
		async getPending(): Promise<CreditCardImport[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<CreditCardImport[]>("/credit-card-imports");
		},
		async reconcileItem(
			importId: string,
			itemId: string,
			data: {
				creditPurchaseId: string;
				sources?: Partial<
					Record<
						"debtSplit" | "description" | "purchaseDate" | "storeName" | "tagIds" | "time",
						"duplicate" | "imported"
					>
				>;
			},
		): Promise<CreditCardImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			return fetchWithAuth<CreditCardImport>(`/credit-card-imports/${importId}/items/${itemId}/reconcile`, {
				body: JSON.stringify(data),
				method: "POST",
			});
		},
		async updateItem(
			importId: string,
			itemId: string,
			data: Omit<
				Partial<
					Pick<
						CreditCardImportItem,
						| "description"
						| "installments"
						| "isSelected"
						| "purchaseDate"
						| "storeName"
						| "tagIds"
						| "time"
						| "totalAmount"
					>
				>,
				"debtSplit"
			> & { debtSplit?: DebtSplitInput | null },
		): Promise<CreditCardImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			return fetchWithAuth<CreditCardImport>(`/credit-card-imports/${importId}/items/${itemId}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
		},
	},

	creditCards: {
		async addPurchase(
			cardId: string,
			data: {
				categoryId?: string;
				debtSplit?: DebtSplitInput;
				description?: string;
				feeAmount?: number;
				feeDescription?: string;
				storeName?: string;
				installments?: number;
				matchDebtEventId?: string;
				purchaseDate: string;
				subscriptionId?: string;
				subscriptionOccurrenceDate?: string;
				time?: string | null;
				tagIds?: string[];
				totalAmount: number;
			},
		): Promise<CreditPurchase[]> {
			if (!isGuestMode()) {
				return fetchWithAuth<CreditPurchase[]>(`/credit-cards/${cardId}/purchases`, {
					body: JSON.stringify(data),
					method: "POST",
				});
			}
			const card = (await localCreditCards.getById(cardId))?.data;
			if (!card) throw new Error("Cartão não encontrado");
			if ((data.subscriptionId === undefined) !== (data.subscriptionOccurrenceDate === undefined)) {
				throw new Error("Informe a assinatura e a data da ocorrência juntas");
			}
			if (data.subscriptionId && data.subscriptionOccurrenceDate) {
				const existing = (await localCreditPurchases.getAll()).find(
					item =>
						item.data.subscriptionId === data.subscriptionId &&
						item.data.subscriptionOccurrenceDate === data.subscriptionOccurrenceDate,
				);
				if (existing) return [existing.data];
			}
			const installments = Math.max(1, data.installments ?? 1);
			const installmentAmounts = getEvenlyDistributedInstallmentAmounts(data.totalAmount, installments);
			const cashbackAmount =
				card.cashbackAccountId && card.cashbackRate
					? Number(((data.totalAmount * card.cashbackRate) / 100).toFixed(4))
					: undefined;
			const rootPurchaseId = crypto.randomUUID();
			const purchaseDate = new Date(`${data.purchaseDate}T12:00:00`);
			const debtSplit = await hydrateLocalDebtSplit(data.totalAmount, data.debtSplit);
			const time = data.time === undefined ? getCurrentLocalTime() : data.time;
			const purchases: CreditPurchase[] = [];
			const statements = new Map<string, CreditCardStatement>();
			for (let currentInstallment = 1; currentInstallment <= installments; currentInstallment++) {
				const installmentAmount = installmentAmounts[currentInstallment - 1]!;
				const occurrenceDate = new Date(purchaseDate);
				occurrenceDate.setMonth(occurrenceDate.getMonth() + currentInstallment - 1);
				const statementMonth = new Date(occurrenceDate);
				if (statementMonth.getDate() > card.statementDay)
					statementMonth.setMonth(statementMonth.getMonth() + 1);
				const statementDate = new Date(
					statementMonth.getFullYear(),
					statementMonth.getMonth(),
					card.statementDay,
				);
				const statementKey = `${cardId}:${statementDate.toISOString().slice(0, 10)}`;
				const storedStatement = await localCreditCardStatements.getById(statementKey);
				const dueDate = new Date(statementDate.getFullYear(), statementDate.getMonth(), card.dueDay);
				if (dueDate <= statementDate) dueDate.setMonth(dueDate.getMonth() + 1);
				const statement = statements.get(statementKey) ??
					storedStatement?.data ?? {
						balanceAmount: 0,
						creditCardId: cardId,
						dueDate: dueDate.toISOString(),
						id: statementKey,
						isPaid: false,
						paidAmount: 0,
						statementDate: statementDate.toISOString(),
						totalAmount: 0,
					};
				statement.totalAmount += installmentAmount;
				statements.set(statementKey, statement);
				purchases.push({
					...(currentInstallment === 1 && {
						cashbackAccountId: cashbackAmount ? card.cashbackAccountId : undefined,
						cashbackAmount,
						cashbackYieldPeriod: cashbackAmount ? card.cashbackYieldPeriod : undefined,
						cashbackYieldReferencePercentage: cashbackAmount
							? card.cashbackYieldReferencePercentage
							: undefined,
						cashbackYieldReferenceRate: cashbackAmount ? card.cashbackYieldReferenceRate : undefined,
						debtSplit,
					}),
					categoryId: data.tagIds?.[0] ?? data.categoryId,
					currentInstallment,
					description: data.description ?? "",
					feeAmount: data.feeAmount || undefined,
					feeDescription: data.feeAmount ? data.feeDescription : undefined,
					id: currentInstallment === 1 ? rootPurchaseId : crypto.randomUUID(),
					installmentAmount,
					installments,
					...(currentInstallment > 1 && { parentId: rootPurchaseId }),
					purchaseDate: data.purchaseDate,
					statementId: statement.id,
					storeName: data.storeName,
					subscriptionId: data.subscriptionId,
					subscriptionOccurrenceDate: data.subscriptionOccurrenceDate,
					tagIds: data.tagIds,
					time,
					totalAmount: data.totalAmount,
				});
			}
			await Promise.all([
				...statements.values().map(statement => localCreditCardStatements.put(statement, statement.id)),
				...purchases.map(purchase => localCreditPurchases.put(purchase, purchase.id)),
			]);
			return purchases;
		},
		async createFromAccount(
			account: FinancialAccount,
			details: NonNullable<FinancialAccountDraft["creditCard"]>,
		) {
			const card: CreditCard = {
				accountName: account.name,
				cashbackAccountId: details.cashbackAccountId ?? null,
				cashbackRate: details.cashbackRate ?? null,
				cashbackYieldPeriod: details.cashbackYieldPeriod ?? null,
				cashbackYieldReferencePercentage: details.cashbackYieldReferencePercentage ?? null,
				cashbackYieldReferenceRate: details.cashbackYieldReferenceRate ?? null,
				creditLimit: details.creditLimit,
				dueDay: details.dueDay,
				excludeFromTotals: details.excludeFromTotals ?? false,
				financialAccountId: account.id,
				id: crypto.randomUUID(),
				securityDeposit: details.securityDeposit ?? null,
				statementDay: details.statementDay,
				workingDueDate: details.workingDueDate,
			};
			await localCreditCards.put(card, card.id);
			return card;
		},
		async deletePurchase(cardId: string, purchaseId: string): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/credit-cards/${cardId}/purchases/${purchaseId}`, { method: "DELETE" });
				return;
			}
			const storedPurchase = await localCreditPurchases.getById(purchaseId);
			if (!storedPurchase) throw new Error("Compra não encontrada");
			const statement = (await localCreditCardStatements.getById(storedPurchase.data.statementId))?.data;
			if (!statement || statement.creditCardId !== cardId) throw new Error("Fatura não encontrada");
			if (statement.isPaid) throw new Error("Compras de faturas pagas não podem ser excluídas");
			if (storedPurchase.data.installments > 1)
				throw new Error("Parcela não pode ser excluída; registre um reembolso");
			statement.totalAmount = storedPurchase.data.isRefund
				? statement.totalAmount - storedPurchase.data.installmentAmount
				: Math.max(0, statement.totalAmount - storedPurchase.data.installmentAmount);
			await Promise.all([
				localCreditPurchases.delete(purchaseId),
				localCreditCardStatements.put(statement, statement.id),
			]);
		},
		async getAll(): Promise<CreditCard[]> {
			if (isGuestMode()) {
				const [storedCards, storedAccounts] = await Promise.all([
					localCreditCards.getAll(),
					localAccounts.getAll(),
				]);
				const accounts = new Map(storedAccounts.map(item => [item.data.id, item.data]));
				return storedCards.map(({ data: card }) => ({
					...card,
					accountName: card.accountName || accounts.get(card.financialAccountId)?.institution?.name || null,
				}));
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const cards = await fetchWithAuth<CreditCard[]>("/credit-cards");
			cacheRemoteData(
				localCreditCards.replaceSnapshot(
					cards.map(card => ({ data: card, localId: card.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return cards;
		},
		async getStatement(cardId: string, statementId: string): Promise<CreditCardStatementDetail> {
			if (isGuestMode()) {
				const statement = (await localCreditCardStatements.getById(statementId))?.data;
				if (!statement || statement.creditCardId !== cardId) throw new Error("Fatura não encontrada");
				const [storedPurchases, storedCategories, storedTransactions] = await Promise.all([
					localCreditPurchases.getAll(),
					localCategories.getAll(),
					localTransactions.getAll(),
				]);
				const categories = new Map(storedCategories.map(item => [item.data.id, item.data]));
				const refundedPurchaseIds = new Set(
					storedPurchases.flatMap(item =>
						item.data.refundOfPurchaseId ? [item.data.refundOfPurchaseId] : [],
					),
				);
				const purchases = storedPurchases
					.map(item => item.data)
					.filter(purchase => purchase.statementId === statementId)
					.map(purchase => {
						const tagIds = purchase.tagIds ?? (purchase.categoryId ? [purchase.categoryId] : []);
						const tags = tagIds.flatMap(tagId => {
							const tag = categories.get(tagId);
							return tag ? [tag] : [];
						});
						return {
							...purchase,
							categoryColor: tags[0]?.color ?? undefined,
							categoryName: tags[0]?.name,
							hasRefund: !purchase.isRefund && refundedPurchaseIds.has(purchase.parentId ?? purchase.id),
							tags,
						};
					})
					.sort((left, right) => right.purchaseDate.localeCompare(left.purchaseDate));
				const payments = storedTransactions
					.map(item => item.data)
					.filter(transaction => transaction.creditCardStatementId === statementId)
					.sort((left, right) => right.date.localeCompare(left.date));
				return {
					...statement,
					balanceAmount: statement.totalAmount - statement.paidAmount,
					payments,
					purchases,
				};
			}
			return fetchWithAuth<CreditCardStatementDetail>(`/credit-cards/${cardId}/statements/${statementId}`);
		},
		async getStatements(cardId: string, isPaid?: boolean): Promise<CreditCardStatement[]> {
			if (isGuestMode()) {
				const statements = (await localCreditCardStatements.getAll())
					.map(item => item.data)
					.filter(statement => statement.creditCardId === cardId)
					.sort((left, right) => right.statementDate.localeCompare(left.statementDate));
				const statementsWithCredits = applyStatementCredits(statements);
				return isPaid === undefined
					? statementsWithCredits
					: statementsWithCredits.filter(statement => statement.isPaid === isPaid);
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const suffix = isPaid === undefined ? "" : `?isPaid=${isPaid}`;
			const statements = await fetchWithAuth<CreditCardStatement[]>(
				`/credit-cards/${cardId}/statements${suffix}`,
			);
			const snapshot = statements.map(statement => ({
				data: statement,
				localId: statement.id,
				syncedAt: Date.now(),
			}));
			if (isPaid === undefined)
				cacheRemoteData(
					localCreditCardStatements.replaceSlice(
						snapshot,
						statement => statement.creditCardId === cardId,
						owner,
					),
				);
			else cacheRemoteData(localCreditCardStatements.bulkPut(snapshot, owner));
			return statements;
		},
		async payStatement(
			cardId: string,
			statementId: string,
			data: { amount?: number; date: string; financialAccountId: string; time?: string | null },
		): Promise<{ statement: CreditCardStatement; transaction: Transaction }> {
			if (!isGuestMode()) {
				const payment = await fetchWithAuth<{ statement: CreditCardStatement; transaction: Transaction }>(
					`/credit-cards/${cardId}/statements/${statementId}/pay`,
					{ body: JSON.stringify(data), method: "POST" },
				);
				await Promise.all([
					localCreditCardStatements.put(payment.statement, payment.statement.id),
					localTransactions.put(payment.transaction, payment.transaction.id),
				]);
				return payment;
			}

			const [storedStatement, storedCard, storedAccount] = await Promise.all([
				localCreditCardStatements.getById(statementId),
				localCreditCards.getById(cardId),
				localAccounts.getById(data.financialAccountId),
			]);
			const statement = storedStatement?.data;
			if (!statement || statement.creditCardId !== cardId) throw new Error("Fatura não encontrada");
			if (statement.isPaid) throw new Error("Esta fatura já foi paga");
			if (!storedCard) throw new Error("Cartão não encontrado");
			if (
				!storedAccount ||
				storedAccount.data.type === "CREDIT_CARD" ||
				storedAccount.data.type === "REWARDS" ||
				storedAccount.data.balance === null
			) {
				throw new Error("Selecione uma conta com saldo próprio");
			}

			const remainingAmount = statement.totalAmount - statement.paidAmount;
			const amount = data.amount ?? remainingAmount;
			if (amount <= 0) throw new Error("Informe um valor maior que zero para a fatura");

			const updatedStatement: CreditCardStatement = {
				...statement,
				balanceAmount: statement.totalAmount - statement.paidAmount - amount,
				isPaid:
					statement.statementDate.slice(0, 10) <= getLocalDateKey() &&
					statement.paidAmount + amount >= statement.totalAmount,
				paidAmount: statement.paidAmount + amount,
			};
			const transaction: Transaction = {
				amount,
				createdAt: new Date().toISOString(),
				creditCardStatementId: statementId,
				date: data.date,
				description: `Pagamento da fatura — ${storedCard.data.accountName || "Cartão de crédito"}`,
				id: crypto.randomUUID(),
				originFinancialAccountId: data.financialAccountId,
				time: data.time === undefined ? getCurrentLocalTime() : data.time,
				type: "EXPENSE",
			};
			await Promise.all([
				localCreditCardStatements.put(updatedStatement, updatedStatement.id),
				localTransactions.put(transaction, transaction.id),
			]);
			return { statement: updatedStatement, transaction };
		},
		async refinancePurchase(
			cardId: string,
			purchaseId: string,
			data: { feeAmount: number; installments: number; purchaseDate: string },
		): Promise<{ purchases: CreditPurchase[]; settledAmount: number; totalAmount: number }> {
			if (isGuestMode())
				throw new Error("Parcelamento de compra ainda não está disponível no modo visitante");
			return fetchWithAuth(`/credit-cards/${cardId}/purchases/${purchaseId}/refinance`, {
				body: JSON.stringify(data),
				method: "POST",
			});
		},
		async refundPurchase(
			cardId: string,
			purchaseId: string,
			data: { amount?: number; date?: string },
		): Promise<CreditPurchase> {
			if (!isGuestMode()) {
				return fetchWithAuth<CreditPurchase>(`/credit-cards/${cardId}/purchases/${purchaseId}/refunds`, {
					body: JSON.stringify(data),
					method: "POST",
				});
			}
			const selectedPurchase = await localCreditPurchases.getById(purchaseId);
			if (!selectedPurchase) throw new Error("Compra não encontrada");
			if (selectedPurchase.data.isRefund) throw new Error("Um reembolso não pode ser reembolsado");
			const rootPurchaseId = selectedPurchase.data.parentId ?? selectedPurchase.data.id;
			const sourcePurchase =
				rootPurchaseId === selectedPurchase.data.id
					? selectedPurchase.data
					: (await localCreditPurchases.getById(rootPurchaseId))?.data;
			if (!sourcePurchase) throw new Error("Compra original não encontrada");
			const card = (await localCreditCards.getById(cardId))?.data;
			if (!card) throw new Error("Cartão não encontrado");
			const allPurchases = (await localCreditPurchases.getAll()).map(item => item.data);
			if (allPurchases.some(purchase => purchase.refundOfPurchaseId === rootPurchaseId))
				throw new Error("Esta compra já foi reembolsada");
			const refundedAmount = allPurchases
				.filter(purchase => purchase.refundOfPurchaseId === rootPurchaseId)
				.reduce((sum, purchase) => sum + Math.abs(purchase.totalAmount), 0);
			const remainingAmount = Math.round((sourcePurchase.totalAmount - refundedAmount) * 100) / 100;
			const refundAmount = data.amount ?? remainingAmount;
			if (refundAmount <= 0) throw new Error("Informe um valor maior que zero para o reembolso");
			const refundDate = data.date ?? sourcePurchase.purchaseDate.slice(0, 10);
			let statementId = sourcePurchase.statementId;
			if (data.date) {
				const purchaseDate = new Date(`${refundDate}T12:00:00`);
				const statementMonth = new Date(purchaseDate);
				if (purchaseDate.getDate() > card.statementDay)
					statementMonth.setMonth(statementMonth.getMonth() + 1);
				const statementDate = new Date(
					statementMonth.getFullYear(),
					statementMonth.getMonth(),
					card.statementDay,
				);
				statementId = `${cardId}:${statementDate.toISOString().slice(0, 10)}`;
				const storedStatement = await localCreditCardStatements.getById(statementId);
				if (!storedStatement) {
					const dueDate = new Date(statementDate.getFullYear(), statementDate.getMonth(), card.dueDay);
					if (dueDate <= statementDate) dueDate.setMonth(dueDate.getMonth() + 1);
					await localCreditCardStatements.put(
						{
							balanceAmount: 0,
							creditCardId: cardId,
							dueDate: dueDate.toISOString(),
							id: statementId,
							isPaid: false,
							paidAmount: 0,
							statementDate: statementDate.toISOString(),
							totalAmount: 0,
						},
						statementId,
					);
				}
			}
			const statement = (await localCreditCardStatements.getById(statementId))?.data;
			if (!statement || statement.creditCardId !== cardId) throw new Error("Fatura não encontrada");
			const refund: CreditPurchase = {
				categoryId: sourcePurchase.categoryId,
				currentInstallment: 1,
				description: `Reembolso — ${sourcePurchase.description || sourcePurchase.storeName || "Compra"}`,
				id: crypto.randomUUID(),
				installmentAmount: -refundAmount,
				installments: 1,
				isRefund: true,
				purchaseDate: refundDate,
				refundOfPurchaseId: rootPurchaseId,
				statementId,
				storeName: sourcePurchase.storeName,
				tagIds: sourcePurchase.tagIds,
				tags: sourcePurchase.tags,
				time: getCurrentLocalTime(),
				totalAmount: -refundAmount,
			};
			await Promise.all([
				localCreditPurchases.put(refund, refund.id),
				localCreditCardStatements.put(
					{ ...statement, totalAmount: statement.totalAmount - refundAmount },
					statement.id,
				),
			]);
			return refund;
		},
		async updatePurchase(
			cardId: string,
			purchaseId: string,
			data:
				| { installmentAmount: number }
				| {
						creditCardId?: string;
						debtSplit?: DebtSplitInput | null;
						description: string;
						feeAmount?: number;
						feeDescription?: string;
						installments: number;
						storeName?: string | null;
						purchaseDate: string;
						time?: string | null;
						tagIds: string[];
						totalAmount: number;
				  },
		): Promise<CreditPurchase> {
			if (!isGuestMode()) {
				return fetchWithAuth<CreditPurchase>(`/credit-cards/${cardId}/purchases/${purchaseId}`, {
					body: JSON.stringify(data),
					method: "PATCH",
				});
			}
			const storedPurchase = await localCreditPurchases.getById(purchaseId);
			if (!storedPurchase) throw new Error("Compra não encontrada");
			const statement = (await localCreditCardStatements.getById(storedPurchase.data.statementId))?.data;
			if (!statement || statement.creditCardId !== cardId) throw new Error("Fatura não encontrada");
			if (statement.isPaid) throw new Error("Compras de faturas pagas não podem ser editadas");
			if ("installmentAmount" in data) {
				if (!storedPurchase.data.parentId) throw new Error("Edite o valor total da compra pai");
				if (storedPurchase.data.installments === 1)
					throw new Error("A compra não possui parcelas para editar");
				const rootPurchaseId = storedPurchase.data.parentId ?? storedPurchase.data.id;
				const installments = (await localCreditPurchases.getAll())
					.map(item => item.data)
					.filter(item => item.id === rootPurchaseId || item.parentId === rootPurchaseId);
				if (installments.length !== storedPurchase.data.installments)
					throw new Error("Não foi possível identificar todas as parcelas da compra");
				const rootPurchase = installments.find(item => item.id === rootPurchaseId);
				if (!rootPurchase) throw new Error("Compra não encontrada");
				const totalAmount =
					installments.reduce(
						(totalInCents, installment) =>
							totalInCents +
							Math.round(
								(installment.id === storedPurchase.data.id
									? data.installmentAmount
									: installment.installmentAmount) * 100,
							),
						0,
					) / 100;
				const rootCashbackAmount =
					rootPurchase.cashbackAmount === null || rootPurchase.cashbackAmount === undefined
						? rootPurchase.cashbackAmount
						: Number(((rootPurchase.cashbackAmount * totalAmount) / rootPurchase.totalAmount).toFixed(4));
				const updatedInstallments = installments.map(installment => ({
					...installment,
					...(installment.id === storedPurchase.data.id && { installmentAmount: data.installmentAmount }),
					...(installment.id === rootPurchaseId && { cashbackAmount: rootCashbackAmount }),
					totalAmount,
				}));
				statement.totalAmount += data.installmentAmount - storedPurchase.data.installmentAmount;
				await Promise.all([
					...updatedInstallments.map(installment => localCreditPurchases.put(installment, installment.id)),
					localCreditCardStatements.put(statement, statement.id),
				]);
				return updatedInstallments.find(installment => installment.id === storedPurchase.data.id)!;
			}
			if (storedPurchase.data.parentId)
				throw new Error("Parcelas específicas permitem editar somente o valor");
			const targetCardId = data.creditCardId ?? cardId;
			const targetCard = (await localCreditCards.getById(targetCardId))?.data;
			if (!targetCard) throw new Error("Cartão não encontrado");
			const installments = Math.max(1, data.installments);
			if (storedPurchase.data.installments > 1 && installments !== storedPurchase.data.installments)
				throw new Error("Não é possível alterar a quantidade de parcelas desta compra");
			const relatedInstallments = (await localCreditPurchases.getAll())
				.map(item => item.data)
				.filter(item => item.id === storedPurchase.data.id || item.parentId === storedPurchase.data.id)
				.toSorted((left, right) => left.currentInstallment - right.currentInstallment);
			if (relatedInstallments.length !== storedPurchase.data.installments)
				throw new Error("Não foi possível identificar todas as parcelas da compra");
			const installmentAmounts = getEvenlyDistributedInstallmentAmounts(data.totalAmount, installments);
			const installmentAmount = installmentAmounts[0]!;
			const cashback = storedPurchase.data.parentId
				? {}
				: targetCardId !== cardId
					? targetCard.cashbackAccountId && targetCard.cashbackRate
						? {
								cashbackAccountId: targetCard.cashbackAccountId,
								cashbackAmount: Number(((data.totalAmount * targetCard.cashbackRate) / 100).toFixed(4)),
								cashbackYieldPeriod: targetCard.cashbackYieldPeriod,
								cashbackYieldReferencePercentage: targetCard.cashbackYieldReferencePercentage,
								cashbackYieldReferenceRate: targetCard.cashbackYieldReferenceRate,
							}
						: {
								cashbackAccountId: null,
								cashbackAmount: null,
								cashbackYieldPeriod: null,
								cashbackYieldReferencePercentage: null,
								cashbackYieldReferenceRate: null,
							}
					: {
							cashbackAmount: storedPurchase.data.cashbackAmount
								? Number(
										(
											(storedPurchase.data.cashbackAmount * data.totalAmount) /
											storedPurchase.data.totalAmount
										).toFixed(4),
									)
								: storedPurchase.data.cashbackAmount,
						};
			const purchaseDate = new Date(`${data.purchaseDate}T12:00:00`);
			const statementMonth = new Date(purchaseDate);
			if (purchaseDate.getDate() > targetCard.statementDay)
				statementMonth.setMonth(statementMonth.getMonth() + 1);
			const targetStatementDate = new Date(
				statementMonth.getFullYear(),
				statementMonth.getMonth(),
				targetCard.statementDay,
			);
			const targetStatementId = `${targetCardId}:${targetStatementDate.toISOString().slice(0, 10)}`;
			const storedTargetStatement = await localCreditCardStatements.getById(targetStatementId);
			const targetDueDate = new Date(
				targetStatementDate.getFullYear(),
				targetStatementDate.getMonth(),
				targetCard.dueDay,
			);
			if (targetDueDate <= targetStatementDate) targetDueDate.setMonth(targetDueDate.getMonth() + 1);
			const targetStatement: CreditCardStatement = storedTargetStatement?.data ?? {
				balanceAmount: 0,
				creditCardId: targetCardId,
				dueDate: targetDueDate.toISOString(),
				id: targetStatementId,
				isPaid: false,
				paidAmount: 0,
				statementDate: targetStatementDate.toISOString(),
				totalAmount: 0,
			};
			if (targetStatement.isPaid && targetStatement.id !== statement.id)
				throw new Error("Não é possível mover uma compra para uma fatura paga");
			const updatedPurchase: CreditPurchase = {
				...storedPurchase.data,
				...cashback,
				categoryId: data.tagIds[0],
				description: data.description,
				...(data.feeAmount !== undefined && {
					feeAmount: data.feeAmount || undefined,
					feeDescription: data.feeAmount ? data.feeDescription : undefined,
				}),
				...(data.debtSplit !== undefined && {
					debtSplit: await hydrateLocalDebtSplit(data.totalAmount, data.debtSplit),
				}),
				...(data.storeName !== undefined && { storeName: data.storeName }),
				installmentAmount,
				installments,
				purchaseDate: data.purchaseDate,
				statementId: targetStatement.id,
				tagIds: data.tagIds,
				...(data.time !== undefined && { time: data.time }),
				totalAmount: data.totalAmount,
			};
			const changedStatement = statement.id !== targetStatement.id;
			if (changedStatement) {
				statement.totalAmount = Math.max(0, statement.totalAmount - storedPurchase.data.installmentAmount);
				targetStatement.totalAmount += installmentAmount;
			} else {
				statement.totalAmount += installmentAmount - storedPurchase.data.installmentAmount;
			}
			const updatedInstallments = relatedInstallments.map((installment, index) =>
				installment.id === purchaseId
					? updatedPurchase
					: {
							...installment,
							installmentAmount: installmentAmounts[index]!,
							totalAmount: data.totalAmount,
						},
			);
			const updatedChildStatements = await Promise.all(
				relatedInstallments.slice(1).map(async (installment, index) => {
					const amountDifference = installmentAmounts[index + 1]! - installment.installmentAmount;
					if (!amountDifference) return undefined;
					const childStatement = (await localCreditCardStatements.getById(installment.statementId))?.data;
					if (!childStatement) return undefined;
					childStatement.totalAmount += amountDifference;
					return childStatement;
				}),
			);
			await Promise.all([
				...updatedInstallments.map(installment => localCreditPurchases.put(installment, installment.id)),
				localCreditCardStatements.put(statement, statement.id),
				...(changedStatement ? [localCreditCardStatements.put(targetStatement, targetStatement.id)] : []),
				...updatedChildStatements
					.filter((childStatement): childStatement is CreditCardStatement => childStatement !== undefined)
					.map(childStatement => localCreditCardStatements.put(childStatement, childStatement.id)),
			]);
			return updatedPurchase;
		},
	},

	// ============== DASHBOARD ==============
	dashboard: {
		async get(dateRange?: { endDate?: string; startDate?: string }): Promise<Dashboard> {
			if (isGuestMode()) {
				const [accounts, transactions, loans, debts, subscriptions, salaries, recurring, cards, statements] =
					await Promise.all([
						dataService.accounts.getAll(),
						dataService.transactions.getAll(),
						dataService.loans.getAll(),
						dataService.debts.getAll(),
						dataService.subscriptions.getAll(),
						dataService.salaries.getAll(),
						dataService.recurringPayments.getAll(),
						localCreditCards.getAll().then(items => items.map(item => item.data)),
						localCreditCardStatements.getAll().then(items => items.map(item => item.data)),
					]);
				const now = new Date();
				const rangeStart = new Date(
					`${dateRange?.startDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`}T00:00:00`,
				);
				const rangeEnd = new Date(
					`${dateRange?.endDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)}T23:59:59`,
				);
				const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);
				const periodTransactions = transactions.filter(transaction => {
					const date = new Date(`${transaction.date.slice(0, 10)}T12:00:00`);
					return transaction.type !== "TRANSFER" && date >= rangeStart && date <= rangeEnd;
				});
				const income = periodTransactions
					.filter(item => item.type === "INCOME")
					.reduce((sum, item) => sum + item.amount, 0);
				const expenses = periodTransactions
					.filter(item => item.type === "EXPENSE")
					.reduce((sum, item) => sum + item.amount, 0);
				const totalBalance = accounts
					.filter(account => !["CREDIT_CARD", "INVESTMENT", "REWARDS"].includes(account.type))
					.reduce((sum, account) => sum + (account.balance ?? 0), 0);
				const savingsBalance = accounts
					.filter(account => account.type === "SAVINGS")
					.reduce((sum, account) => sum + (account.balance ?? 0), 0);
				const accountBalance = totalBalance - savingsBalance;
				const owedToMe = debts.filter(d => d.isOwedToMe && !d.isPaid).reduce((sum, d) => sum + d.amount, 0);
				const iOwe = debts.filter(d => !d.isOwedToMe && !d.isPaid).reduce((sum, d) => sum + d.amount, 0);
				const nextMonthly = (start: string, day: number) => {
					const date = new Date(now.getFullYear(), now.getMonth(), day);
					if (date < now) date.setMonth(date.getMonth() + 1);
					return date < new Date(`${start.slice(0, 10)}T00:00:00`)
						? new Date(`${start.slice(0, 10)}T00:00:00`)
						: date;
				};
				const forecasts = [
					...salaries
						.filter(item => item.isActive)
						.map(item => ({
							amount: item.amount,
							date: dateKey(nextMonthly(item.startDate, item.payDay)),
							direction: "INCOME" as const,
							id: `salary-${item.id}`,
							name: item.source,
							sourceId: item.id,
							type: "SALARY" as const,
						})),
					...subscriptions
						.filter(item => item.isActive)
						.map(item => ({
							amount: item.amount,
							date: dateKey(nextMonthly(item.startDate, item.billingDay)),
							direction: "EXPENSE" as const,
							id: `subscription-${item.id}`,
							name: item.name,
							sourceId: item.id,
							type: "SUBSCRIPTION" as const,
						})),
					...recurring
						.filter(item => item.isActive)
						.map(item => ({
							amount: item.amount,
							date: dateKey(
								nextMonthly(item.startDate, item.dayOfMonth ?? new Date(item.startDate).getDate()),
							),
							direction: item.type === "INCOME" ? ("INCOME" as const) : ("EXPENSE" as const),
							id: `recurring-${item.id}`,
							name: item.name,
							sourceId: item.id,
							type: "RECURRING" as const,
						})),
					...loans
						.filter(item => (item.remainingInstallments ?? item.totalInstallments) > 0)
						.map(item => ({
							amount: item.installmentAmount,
							date: dateKey(new Date(item.firstDueDate)),
							direction: "EXPENSE" as const,
							id: `loan-${item.id}`,
							name: item.lender,
							sourceId: item.id,
							type: "LOAN" as const,
						})),
					...transactions
						.filter(
							item =>
								item.type !== "TRANSFER" &&
								new Date(`${item.date.slice(0, 10)}T12:00:00`) > now &&
								!item.recurrenceId &&
								!item.salaryId &&
								!item.subscriptionId,
						)
						.map(item => ({
							amount: item.amount,
							date: item.date.slice(0, 10),
							direction: item.type as "INCOME" | "EXPENSE",
							id: `transaction-${item.id}`,
							name: item.description ?? "Movimentação",
							sourceId: item.id,
							type: "TRANSACTION" as const,
						})),
				].toSorted((left, right) => left.date.localeCompare(right.date));
				const comparisonStart = new Date(rangeStart.getFullYear(), rangeStart.getMonth(), 1);
				const comparisonMonths =
					(rangeEnd.getFullYear() - comparisonStart.getFullYear()) * 12 +
					rangeEnd.getMonth() -
					comparisonStart.getMonth() +
					1;
				const comparisonEnd = new Date(
					comparisonStart.getFullYear(),
					comparisonStart.getMonth() + comparisonMonths * 7,
					0,
					23,
					59,
					59,
				);
				const projectionStart = new Date(now);
				projectionStart.setHours(12, 0, 0, 0);
				projectionStart.setDate(projectionStart.getDate() + 1);
				const linkedTransactionDates = new Set(
					transactions.flatMap(transaction => {
						const sourceId = transaction.salaryId ?? transaction.subscriptionId ?? transaction.recurrenceId;
						return sourceId ? [`${sourceId}:${transaction.date.slice(0, 10)}`] : [];
					}),
				);
				const projectedMovements: Array<{ amount: number; date: Date; type: "EXPENSE" | "INCOME" }> = [];
				const addSchedule = (item: {
					amount: number;
					day: number;
					dayOfWeek?: null | number;
					endDate?: string | null;
					frequency: "BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY";
					sourceId: string;
					startDate: string;
					type: "EXPENSE" | "INCOME";
				}) => {
					const start = new Date(`${item.startDate.slice(0, 10)}T12:00:00`);
					const end = item.endDate ? new Date(`${item.endDate.slice(0, 10)}T12:00:00`) : comparisonEnd;
					let yearOffset = 0;
					let occurrence = new Date(
						start.getFullYear(),
						start.getMonth(),
						item.frequency === "MONTHLY"
							? Math.min(item.day, new Date(start.getFullYear(), start.getMonth() + 1, 0).getDate())
							: start.getDate(),
						12,
					);
					if (item.frequency === "WEEKLY" && item.dayOfWeek !== null && item.dayOfWeek !== undefined)
						occurrence.setDate(occurrence.getDate() + ((item.dayOfWeek - occurrence.getDay() + 7) % 7));
					while (occurrence <= comparisonEnd && occurrence <= end) {
						if (
							occurrence >= projectionStart &&
							!linkedTransactionDates.has(`${item.sourceId}:${dateKey(occurrence)}`)
						)
							projectedMovements.push({ amount: item.amount, date: occurrence, type: item.type });
						if (item.frequency === "DAILY") occurrence.setDate(occurrence.getDate() + 1);
						if (item.frequency === "WEEKLY") occurrence.setDate(occurrence.getDate() + 7);
						if (item.frequency === "BIWEEKLY") occurrence.setDate(occurrence.getDate() + 14);
						if (item.frequency === "YEARLY") {
							yearOffset += 1;
							const year = start.getFullYear() + yearOffset;
							occurrence = new Date(
								year,
								start.getMonth(),
								Math.min(start.getDate(), new Date(year, start.getMonth() + 1, 0).getDate()),
								12,
							);
						}
						if (item.frequency === "MONTHLY")
							occurrence = new Date(
								occurrence.getFullYear(),
								occurrence.getMonth() + 1,
								Math.min(
									item.day,
									new Date(occurrence.getFullYear(), occurrence.getMonth() + 2, 0).getDate(),
								),
								12,
							);
					}
				};
				for (const salary of salaries.filter(item => item.isActive))
					addSchedule({
						amount: salary.amount,
						day: salary.payDay,
						dayOfWeek: salary.dayOfWeek,
						endDate: salary.endDate,
						frequency: salary.frequency,
						sourceId: salary.id,
						startDate: salary.startDate,
						type: "INCOME",
					});
				for (const subscription of subscriptions.filter(item => item.isActive))
					addSchedule({
						amount: subscription.amount,
						day: subscription.billingDay,
						dayOfWeek: subscription.dayOfWeek,
						endDate: subscription.endDate,
						frequency: subscription.frequency,
						sourceId: subscription.id,
						startDate: subscription.startDate,
						type: "EXPENSE",
					});
				for (const recurrence of recurring.filter(item => item.isActive))
					addSchedule({
						amount: recurrence.amount,
						day: recurrence.dayOfMonth ?? new Date(recurrence.startDate).getDate(),
						dayOfWeek: recurrence.dayOfWeek,
						endDate: recurrence.endDate,
						frequency: recurrence.frequency,
						sourceId: recurrence.id,
						startDate: recurrence.startDate,
						type: recurrence.type === "INCOME" ? "INCOME" : "EXPENSE",
					});
				for (const statement of statements) {
					const dueDate = new Date(`${statement.dueDate.slice(0, 10)}T12:00:00`);
					const outstanding = Math.max(0, statement.totalAmount - statement.paidAmount);
					if (outstanding && dueDate >= projectionStart && dueDate <= comparisonEnd)
						projectedMovements.push({ amount: outstanding, date: dueDate, type: "EXPENSE" });
				}
				const creditCards = cards.map(card => {
					const cardStatements = statements.filter(statement => statement.creditCardId === card.id);
					const statement =
						cardStatements
							.toSorted((left, right) => left.dueDate.localeCompare(right.dueDate))
							.find(item => item.dueDate >= dateKey(now)) ?? cardStatements.at(-1);
					const used = cardStatements.reduce(
						(sum, item) => sum + Math.max(0, item.totalAmount - item.paidAmount),
						0,
					);
					return {
						availableLimit: Math.max(0, card.creditLimit - used),
						creditLimit: card.creditLimit,
						excludeFromTotals: card.excludeFromTotals,
						financialAccountId: card.financialAccountId,
						id: card.id,
						institutionName:
							accounts.find(account => account.id === card.financialAccountId)?.institution?.name ?? null,
						name:
							accounts.find(account => account.id === card.financialAccountId)?.name ??
							card.accountName ??
							null,
						statement: statement
							? {
									balanceAmount: Math.max(0, statement.totalAmount - statement.paidAmount),
									dueDate: statement.dueDate.slice(0, 10),
									id: statement.id,
								}
							: null,
					};
				});
				const comparisonTransactions = [
					...transactions.map(transaction => ({
						...transaction,
						date: new Date(`${transaction.date.slice(0, 10)}T12:00:00`),
					})),
					...projectedMovements,
				];
				const endOfCurrentMonth = new Date(now.getFullYear(), now.getMonth() + 1, 0, 23, 59, 59);
				const projectedMovementsUntilMonthEnd = comparisonTransactions.filter(
					item => item.date >= projectionStart && item.date <= endOfCurrentMonth,
				);
				const projectedExpenses = projectedMovementsUntilMonthEnd
					.filter(item => item.type === "EXPENSE")
					.reduce((sum, item) => sum + item.amount, 0);
				const projectedIncome = projectedMovementsUntilMonthEnd
					.filter(item => item.type === "INCOME")
					.reduce((sum, item) => sum + item.amount, 0);
				const projectedCashFlowUntilMonthEnd = {
					expenses: projectedExpenses,
					income: projectedIncome,
					net: projectedIncome - projectedExpenses,
				};
				const today = new Date(now);
				today.setHours(23, 59, 59, 999);
				const balanceMovementNet = (items: typeof comparisonTransactions) =>
					items
						.filter(item => item.type !== "TRANSFER")
						.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0);
				const endingBalance =
					rangeEnd < today
						? totalBalance -
							balanceMovementNet(
								comparisonTransactions.filter(item => item.date > rangeEnd && item.date <= today),
							)
						: rangeEnd > today
							? totalBalance +
								balanceMovementNet(
									comparisonTransactions.filter(item => item.date > today && item.date <= rangeEnd),
								)
							: totalBalance;
				const period = {
					accountBalance,
					endDate: dateKey(rangeEnd),
					endingBalance,
					expenses,
					income,
					initialBalance: endingBalance - income + expenses,
					net: income - expenses,
					savingsBalance,
					startDate: dateKey(rangeStart),
				};
				const comparison = Array.from({ length: 13 }, (_, index) => {
					const start = new Date(
						comparisonStart.getFullYear(),
						comparisonStart.getMonth() + (index - 6) * comparisonMonths,
						1,
					);
					const end = new Date(start.getFullYear(), start.getMonth() + comparisonMonths, 0, 23, 59, 59);
					const movements = comparisonTransactions.filter(
						item => item.type !== "TRANSFER" && item.date >= start && item.date <= end,
					);
					const comparisonIncome = movements
						.filter(item => item.type === "INCOME")
						.reduce((sum, item) => sum + item.amount, 0);
					const comparisonExpenses = movements
						.filter(item => item.type === "EXPENSE")
						.reduce((sum, item) => sum + item.amount, 0);
					return {
						accountBalance,
						endDate: dateKey(end),
						endingBalance:
							totalBalance -
							comparisonTransactions
								.filter(item => item.type !== "TRANSFER" && item.date > end)
								.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0),
						expenses: comparisonExpenses,
						income: comparisonIncome,
						initialBalance:
							totalBalance -
							comparisonTransactions
								.filter(item => item.type !== "TRANSFER" && item.date >= start)
								.reduce((sum, item) => sum + (item.type === "INCOME" ? item.amount : -item.amount), 0),
						net: comparisonIncome - comparisonExpenses,
						savingsBalance,
						startDate: dateKey(start),
					};
				});
				return {
					accounts: accounts
						.filter(account => account.type === "CHECKING" || account.type === "SAVINGS")
						.map(account => ({
							balance: account.balance ?? 0,
							id: account.id,
							institutionName: account.institution?.name ?? null,
							name: account.name,
							type: account.type as "CHECKING" | "SAVINGS",
						})),
					balanceBreakdown: { accountBalance, savingsBalance },
					comparison,
					creditCards,
					dailyBalances: transactions
						.filter(transaction => {
							const date = new Date(`${transaction.date.slice(0, 10)}T12:00:00`);
							return date >= rangeStart && date <= rangeEnd;
						})
						.map(transaction => transaction.date.slice(0, 10))
						.filter((date, index, dates) => dates.indexOf(date) === index)
						.toSorted()
						.map(date => ({
							balance:
								period.initialBalance +
								balanceMovementNet(
									comparisonTransactions.filter(
										item => item.date >= rangeStart && dateKey(item.date) <= date,
									),
								),
							date,
						})),
					debts: {
						iOwe,
						net: owedToMe - iOwe,
						owedToMe,
						people: debts
							.filter(item => !item.isPaid)
							.map(item => ({
								balance: item.isOwedToMe ? item.amount : -item.amount,
								direction: item.isOwedToMe ? ("OWED" as const) : ("OWES" as const),
								id: item.personId ?? item.id,
								name: item.personName,
							})),
					},
					forecasts,
					period,
					projectedCashFlowUntilMonthEnd,
					totalAvailableCredit: creditCards
						.filter(card => !card.excludeFromTotals)
						.reduce((sum, card) => sum + card.availableLimit, 0),
				};
			}
			const params = new URLSearchParams();
			if (dateRange?.startDate) params.set("startDate", dateRange.startDate);
			if (dateRange?.endDate) params.set("endDate", dateRange.endDate);
			return fetchWithAuth<Dashboard>(`/dashboard${params.size ? `?${params}` : ""}`);
		},
	},

	// ============== DEBTS ==============
	debts: {
		async acceptInvitation(id: string, personId?: string): Promise<void> {
			if (isGuestMode()) throw new Error("Conecte sua conta para aceitar convites.");
			await fetchWithAuth(`/debts/invitations/${id}/accept`, {
				body: JSON.stringify({ personId }),
				method: "POST",
			});
		},
		async create(
			data: Omit<Debt, "id" | "isPaid" | "paidDate" | "userId"> & { isPaid?: boolean; paidDate?: string },
		): Promise<Debt> {
			const userId = getUserId();
			if (isGuestMode()) {
				const newDebt: Debt = {
					...data,
					id: crypto.randomUUID(),
					isPaid: data.isPaid ?? false,
					userId,
				};
				await localDebts.put(newDebt, newDebt.id);
				return newDebt;
			}
			const debt = await fetchWithAuth<Debt>("/debts", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localDebts.put(debt, debt.id);
			return debt;
		},
		async createOrigin(data: {
			amount: number;
			date?: null | string;
			debtSplit: DebtSplitInput;
			description?: string;
			dueDate?: string;
			isOwedToMe: boolean;
		}): Promise<void> {
			if (isGuestMode()) {
				const calculated = calculateDebtSplit(data.amount, data.debtSplit);
				if (!calculated) throw new Error("O rateio da dívida não fecha com o valor total.");
				const people = await Promise.all(
					calculated.participants.map(async participant => {
						const person = await localDebtPeople.getById(participant.debtPersonId);
						if (!person) throw new Error("Pessoa não encontrada");
						return { amount: participant.amount, person: person.data };
					}),
				);
				await Promise.all(
					people.map(({ amount, person }) => {
						const debt: Debt = {
							amount,
							date: data.date ?? undefined,
							description: data.description,
							dueDate: data.dueDate,
							id: crypto.randomUUID(),
							isOwedToMe: data.isOwedToMe,
							isPaid: false,
							personId: person.id,
							personName: person.name,
							userId: getUserId(),
						};
						return localDebts.put(debt, debt.id);
					}),
				);
				return;
			}
			await fetchWithAuth("/debts/events", { body: JSON.stringify(data), method: "POST" });
		},
		async createPerson(name: string): Promise<DebtPerson> {
			if (isGuestMode()) {
				const normalizedName = name.trim().replace(/\s+/g, " ").toLocaleLowerCase("pt-BR");
				const existing = (await localDebtPeople.getAll()).find(
					item => item.data.name.toLocaleLowerCase("pt-BR") === normalizedName,
				);
				if (existing) return existing.data;
				const person: DebtPerson = {
					balance: 0,
					connectionStatus: null,
					events: [],
					id: crypto.randomUUID(),
					isZaimuUser: false,
					name: name.trim().replace(/\s+/g, " "),
				};
				await localDebtPeople.put(person, person.id);
				return person;
			}
			return fetchWithAuth<DebtPerson>("/debts/people", {
				body: JSON.stringify({ name }),
				method: "POST",
			});
		},
		async declineInvitation(id: string): Promise<void> {
			if (isGuestMode()) throw new Error("Conecte sua conta para recusar convites.");
			await fetchWithAuth(`/debts/invitations/${id}/decline`, { method: "POST" });
		},

		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				await localDebts.delete(id);
				return;
			}
			await fetchWithAuth(`/debts/${id}`, { method: "DELETE" });
			await localDebts.delete(id);
		},
		async deleteEvent(id: string): Promise<void> {
			if (isGuestMode()) {
				if (id.startsWith("transaction:") || id.startsWith("purchase:"))
					throw new Error("Exclua a movimentação financeira original.");
				await localDebts.delete(id);
				return;
			}
			await fetchWithAuth(`/debts/events/${id}`, { method: "DELETE" });
		},
		async deletePerson(id: string): Promise<void> {
			if (isGuestMode()) {
				await localDebtPeople.delete(id);
				return;
			}
			await fetchWithAuth(`/debts/people/${id}`, { method: "DELETE" });
		},
		async getAll(): Promise<Debt[]> {
			if (isGuestMode()) {
				const local = await localDebts.getAll();
				return local.map(item => item.data);
			}
			return [];
		},
		async getInvitations(): Promise<DebtInvitation[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<DebtInvitation[]>("/debts/invitations");
		},
		async getLedger(): Promise<DebtLedger> {
			if (!isGuestMode()) {
				const owner = getCurrentCacheIdentity();
				if (!owner) throw new Error("Identidade local indisponível.");
				const ledger = await fetchWithAuth<DebtLedger>("/debts");
				cacheRemoteData(
					localDebtPeople.replaceSnapshot(
						ledger.people.map(person => ({ data: person, localId: person.id, syncedAt: Date.now() })),
						owner,
					),
				);
				return ledger;
			}
			const [storedPeople, storedDebts, storedTransactions, storedPurchases] = await Promise.all([
				localDebtPeople.getAll(),
				localDebts.getAll(),
				localTransactions.getAll(),
				localCreditPurchases.getAll(),
			]);
			const people = new Map<string, DebtPerson>(
				storedPeople.map(item => [item.data.id, { ...item.data, balance: 0, events: [] }]),
			);
			for (const debtItem of storedDebts) {
				const debt = debtItem.data;
				let person = debt.personId ? people.get(debt.personId) : undefined;
				if (!person) {
					person = [...people.values()].find(
						item => item.name.localeCompare(debt.personName, "pt-BR", { sensitivity: "base" }) === 0,
					);
				}
				if (!person) {
					person = {
						balance: 0,
						connectionStatus: null,
						events: [],
						id: debt.personId ?? `legacy:${debt.personName.toLocaleLowerCase("pt-BR")}`,
						isZaimuUser: false,
						name: debt.personName,
					};
					people.set(person.id, person);
				}
				const effect = Number(debt.amount) * (debt.isOwedToMe ? 1 : -1);
				person.events.push({
					amount: Number(debt.amount),
					createdByMe: true,
					createdByName: "Você",
					createdByUserId: getUserId(),
					date: debt.date ?? null,
					description: debt.description,
					dueDate: debt.dueDate,
					effect,
					id: debt.id,
					kind: "ORIGIN",
				});
				if (!debt.isPaid) person.balance += effect;
			}
			for (const item of storedTransactions) {
				const transaction = item.data;
				if (!transaction.debtSplit || transaction.type === "TRANSFER") continue;
				for (const participant of transaction.debtSplit.participants) {
					const person = people.get(participant.debtPersonId);
					if (!person) continue;
					const effect = transaction.type === "INCOME" ? -participant.amount : participant.amount;
					person.balance += effect;
					person.events.push({
						amount: participant.amount,
						createdByMe: true,
						createdByName: "Você",
						createdByUserId: getUserId(),
						date: transaction.date,
						description: transaction.description,
						effect,
						id: `transaction:${transaction.id}:${participant.debtPersonId}`,
						kind: "TRANSACTION",
					});
				}
			}
			for (const item of storedPurchases) {
				const purchase = item.data;
				if (!purchase.debtSplit || purchase.currentInstallment !== 1) continue;
				for (const participant of purchase.debtSplit.participants) {
					const person = people.get(participant.debtPersonId);
					if (!person) continue;
					person.balance += participant.amount;
					person.events.push({
						amount: participant.amount,
						createdByMe: true,
						createdByName: "Você",
						createdByUserId: getUserId(),
						date: purchase.purchaseDate,
						description: purchase.description || purchase.storeName || "Compra",
						effect: participant.amount,
						id: `purchase:${purchase.id}:${participant.debtPersonId}`,
						kind: "PURCHASE",
					});
				}
			}
			const result = [...people.values()].map(person => ({
				...person,
				events: person.events.toSorted((left, right) => {
					if (left.date && right.date) {
						const dateComparison = right.date.localeCompare(left.date);
						if (dateComparison) return dateComparison;
					} else if (left.date) {
						return -1;
					} else if (right.date) {
						return 1;
					}
					return (left.description ?? "Lançamento manual").localeCompare(
						right.description ?? "Lançamento manual",
						"pt-BR",
						{ sensitivity: "base" },
					);
				}),
			}));
			return {
				people: result,
				totals: result.reduce(
					(totals, person) => {
						if (person.balance > 0) totals.owedToMe += person.balance;
						if (person.balance < 0) totals.iOwe += Math.abs(person.balance);
						totals.net += person.balance;
						return totals;
					},
					{ iOwe: 0, net: 0, owedToMe: 0 },
				),
			};
		},
		async invitePerson(id: string, email: string): Promise<void> {
			if (isGuestMode()) throw new Error("Conecte sua conta para associar usuários Zaimu.");
			await fetchWithAuth(`/debts/people/${id}/invite`, {
				body: JSON.stringify({ email }),
				method: "POST",
			});
		},

		async update(id: string, data: Partial<Debt>): Promise<Debt> {
			if (isGuestMode()) {
				const existing = await localDebts.getById(id);
				if (!existing) throw new Error("Debt not found");
				const updated: Debt = { ...existing.data, ...data };
				await localDebts.put(updated, id);
				return updated;
			}
			const debt = await fetchWithAuth<Debt>(`/debts/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localDebts.put(debt, debt.id);
			return debt;
		},
		async updateOrigin(
			id: string,
			data: {
				amount: number;
				date?: null | string;
				description?: string;
				dueDate?: string;
				isOwedToMe: boolean;
				personId: string;
			},
		): Promise<void> {
			if (isGuestMode()) {
				const person = await localDebtPeople.getById(data.personId);
				const debt = await localDebts.getById(id);
				if (!person || !debt) throw new Error("Origem não encontrada");
				await localDebts.put(
					{
						...debt.data,
						...data,
						date: data.date === null ? undefined : (data.date ?? debt.data.date),
						personId: person.data.id,
						personName: person.data.name,
					},
					id,
				);
				return;
			}
			await fetchWithAuth(`/debts/events/${id}`, { body: JSON.stringify(data), method: "PATCH" });
		},
	},
	financialInstitutions: {
		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				const accounts = await localAccounts.getAll();
				await Promise.all(
					accounts
						.filter(item => item.data.institutionId === id)
						.map(item =>
							localAccounts.put(
								{ ...item.data, institution: null, institutionId: null, updatedAt: new Date().toISOString() },
								item.localId,
							),
						),
				);
				return;
			}
			await fetchWithAuth(`/financial-institutions/${id}`, { method: "DELETE" });
		},
		async update(
			id: string,
			data: {
				name?: string;
				yieldPolicy?: Omit<import("./api").FinancialInstitutionYieldPolicy, "effectiveDate">;
			},
		): Promise<FinancialInstitution> {
			if (isGuestMode()) {
				const accounts = await localAccounts.getAll();
				const institution = accounts.find(item => item.data.institutionId === id)?.data.institution;
				if (!institution) throw new Error("Instituição financeira não encontrada");
				const effectiveDate = new Date();
				effectiveDate.setDate(effectiveDate.getDate() + 1);
				const effectiveDateKey = effectiveDate.toISOString().slice(0, 10);
				const updated = {
					...institution,
					...(data.name !== undefined && { name: data.name.normalize("NFKC").trim().replace(/\s+/gu, " ") }),
					...(data.yieldPolicy && {
						yieldPolicies: [
							...(institution.yieldPolicies ?? []).filter(
								policy => policy.effectiveDate.slice(0, 10) < effectiveDateKey,
							),
							{ ...data.yieldPolicy, effectiveDate: effectiveDateKey },
						],
					}),
				};
				await Promise.all(
					accounts
						.filter(item => item.data.institutionId === id)
						.map(item =>
							localAccounts.put(
								{ ...item.data, institution: updated, updatedAt: new Date().toISOString() },
								item.localId,
							),
						),
				);
				return updated;
			}
			return fetchWithAuth<FinancialInstitution>(`/financial-institutions/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
		},
	},

	// ============== LOANS ==============
	loans: {
		async create(data: Omit<Loan, "id" | "userId">): Promise<Loan> {
			const userId = getUserId();
			if (isGuestMode()) {
				const newLoan: Loan = {
					...data,
					id: crypto.randomUUID(),
					userId,
				};
				await localLoans.put(newLoan, newLoan.id);
				return newLoan;
			}
			const loan = await fetchWithAuth<Loan>("/loans", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localLoans.put(loan, loan.id);
			return loan;
		},

		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				await localLoans.delete(id);
				return;
			}
			await fetchWithAuth(`/loans/${id}`, { method: "DELETE" });
			await localLoans.delete(id);
		},
		async getAll(): Promise<Loan[]> {
			if (isGuestMode()) {
				const local = await localLoans.getAll();
				return local.map(item => item.data);
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const loans = await fetchWithAuth<Loan[]>("/loans");
			cacheRemoteData(
				localLoans.replaceSnapshot(
					loans.map(l => ({ data: l, localId: l.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return loans;
		},

		async update(id: string, data: Partial<Loan>): Promise<Loan> {
			if (isGuestMode()) {
				const existing = await localLoans.getById(id);
				if (!existing) throw new Error("Loan not found");
				const updated: Loan = { ...existing.data, ...data };
				await localLoans.put(updated, id);
				return updated;
			}
			const loan = await fetchWithAuth<Loan>(`/loans/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localLoans.put(loan, loan.id);
			return loan;
		},
	},

	recurringPayments: {
		async create(
			data: Omit<
				RecurringPayment,
				"createdAt" | "debtSplit" | "id" | "isActive" | "paymentMethod" | "updatedAt" | "userId"
			> & {
				debtSplit?: DebtSplitInput;
				isActive?: boolean;
				paymentMethod?: RecurringPayment["paymentMethod"];
			},
		): Promise<RecurringPayment> {
			const userId = getUserId();
			if (isGuestMode()) {
				const debtSplit = await hydrateLocalDebtSplit(data.amount, data.debtSplit);
				const payment: RecurringPayment = {
					...data,
					createdAt: new Date().toISOString(),
					debtSplit,
					id: crypto.randomUUID(),
					isActive: data.isActive ?? true,
					paymentMethod: data.paymentMethod ?? "DEBIT",
					updatedAt: new Date().toISOString(),
					userId,
				};
				await localRecurringPayments.put(payment, payment.id);
				return payment;
			}
			return fetchWithAuth<RecurringPayment>("/recurring", { body: JSON.stringify(data), method: "POST" });
		},
		async delete(id: string, deleteTransactions = false) {
			if (isGuestMode()) {
				if (deleteTransactions) {
					const transactions = await localTransactions.getAll();
					await Promise.all(
						transactions
							.filter(transaction => transaction.data.recurrenceId === id)
							.map(transaction => localTransactions.delete(transaction.localId)),
					);
				}
				return localRecurringPayments.delete(id);
			}
			await fetchWithAuth(`/recurring/${id}?deleteTransactions=${deleteTransactions}`, { method: "DELETE" });
		},
		async getAll(): Promise<RecurringPayment[]> {
			if (isGuestMode()) return (await localRecurringPayments.getAll()).map(item => item.data);
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const payments = await fetchWithAuth<RecurringPayment[]>("/recurring");
			cacheRemoteData(
				localRecurringPayments.replaceSnapshot(
					payments.map(payment => ({ data: payment, localId: payment.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return payments;
		},
		async update(
			id: string,
			changes: Omit<Partial<RecurringPayment>, "debtSplit"> & { debtSplit?: DebtSplitInput | null },
		): Promise<RecurringPayment> {
			if (isGuestMode()) {
				const { debtSplit: debtSplitInput, ...paymentChanges } = changes;
				const existing = await localRecurringPayments.getById(id);
				if (!existing) throw new Error("Recorrência não encontrada");
				const hasTagChanges = changes.tagIds !== undefined || changes.categoryId !== undefined;
				const tagIds = changes.tagIds ?? (changes.categoryId ? [changes.categoryId] : []);
				const payment: RecurringPayment = {
					...existing.data,
					...paymentChanges,
					...(debtSplitInput !== undefined && {
						debtSplit: await hydrateLocalDebtSplit(changes.amount ?? existing.data.amount, debtSplitInput),
					}),
					...(hasTagChanges && { categoryId: tagIds[0], tagIds }),
					updatedAt: new Date().toISOString(),
				};
				await localRecurringPayments.put(payment, id);
				return payment;
			}
			return fetchWithAuth<RecurringPayment>(`/recurring/${id}`, {
				body: JSON.stringify(changes),
				method: "PATCH",
			});
		},
	},

	// ============== SALARIES ==============
	salaries: {
		async create(data: {
			amount: number;
			dayOfWeek?: Salary["dayOfWeek"];
			endDate?: string;
			financialAccountId: string;
			frequency: Salary["frequency"];
			autoGenerateFrom: string;
			isActive?: boolean;
			payDay: number;
			source: string;
			startDate: string;
			tagIds?: string[];
		}): Promise<Salary> {
			const userId = getUserId();
			if (isGuestMode()) {
				const { amount, ...salaryData } = data;
				const newSalary: Salary = {
					...salaryData,
					amount,
					id: crypto.randomUUID(),
					isActive: data.isActive ?? true,
					userId,
				};
				await localSalaries.put(newSalary, newSalary.id);
				return newSalary;
			}
			const salary = await fetchWithAuth<Salary>("/salaries", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localSalaries.put(salary, salary.id);
			return salary;
		},

		async delete(id: string, deleteTransactions = false): Promise<void> {
			if (isGuestMode()) {
				if (deleteTransactions) {
					const transactions = await localTransactions.getAll();
					await Promise.all(
						transactions
							.filter(transaction => transaction.data.salaryId === id)
							.map(transaction => localTransactions.delete(transaction.localId)),
					);
				}
				await localSalaries.delete(id);
				return;
			}
			await fetchWithAuth(`/salaries/${id}?deleteTransactions=${deleteTransactions}`, { method: "DELETE" });
			await localSalaries.delete(id);
		},
		async getAll(): Promise<Salary[]> {
			if (isGuestMode()) {
				const local = await localSalaries.getAll();
				return local.map(item => normalizeSalary(item.data as LegacySalary));
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const salaries = (await fetchWithAuth<Salary[]>("/salaries")).map(normalizeSalary);
			cacheRemoteData(
				localSalaries.replaceSnapshot(
					salaries.map(s => ({ data: s, localId: s.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return salaries;
		},

		async update(id: string, data: Partial<Salary>): Promise<Salary> {
			if (isGuestMode()) {
				const existing = await localSalaries.getById(id);
				if (!existing) throw new Error("Salary not found");
				const hasTagChanges = data.tagIds !== undefined || data.categoryId !== undefined;
				const tagIds = data.tagIds ?? (data.categoryId ? [data.categoryId] : []);
				const updated: Salary = {
					...existing.data,
					...data,
					...(hasTagChanges && { categoryId: tagIds[0], tagIds }),
				};
				await localSalaries.put(updated, id);
				return updated;
			}
			const salary = await fetchWithAuth<Salary>(`/salaries/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localSalaries.put(salary, salary.id);
			return salary;
		},
	},

	// ============== STORES ==============
	stores: {
		async create(name: string): Promise<Store> {
			if (isGuestMode()) {
				const store: Store = { id: crypto.randomUUID(), name, userId: getUserId() };
				await localStores.put(store, store.id);
				return store;
			}
			const store = await fetchWithAuth<Store>("/stores", {
				body: JSON.stringify({ name }),
				method: "POST",
			});
			await localStores.put(store, store.id);
			return store;
		},

		async getAll(): Promise<Store[]> {
			if (isGuestMode()) return (await localStores.getAll()).map(item => item.data);
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const stores = await fetchWithAuth<Store[]>("/stores");
			cacheRemoteData(
				localStores.replaceSnapshot(
					stores.map(store => ({ data: store, localId: store.id })),
					owner,
				),
			);
			return stores;
		},
	},

	// ============== SUBSCRIPTIONS ==============
	subscriptions: {
		async create(
			data: Omit<Subscription, "debtSplit" | "id" | "isActive" | "userId"> & {
				debtSplit?: DebtSplitInput;
				isActive?: boolean;
			},
		): Promise<Subscription> {
			const userId = getUserId();
			if (isGuestMode()) {
				const debtSplit = await hydrateLocalDebtSplit(data.amount, data.debtSplit);
				const newSubscription: Subscription = {
					...data,
					debtSplit,
					id: crypto.randomUUID(),
					isActive: data.isActive ?? true,
					userId,
				};
				await localSubscriptions.put(newSubscription, newSubscription.id);
				return newSubscription;
			}
			const subscription = await fetchWithAuth<Subscription>("/subscriptions", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localSubscriptions.put(subscription, subscription.id);
			return subscription;
		},

		async delete(id: string, deleteTransactions = false): Promise<void> {
			if (isGuestMode()) {
				if (deleteTransactions) {
					const [transactions, purchases] = await Promise.all([
						localTransactions.getAll(),
						localCreditPurchases.getAll(),
					]);
					await Promise.all(
						transactions
							.filter(transaction => transaction.data.subscriptionId === id)
							.map(transaction => localTransactions.delete(transaction.localId)),
					);
					for (const purchase of purchases.filter(purchase => purchase.data.subscriptionId === id)) {
						const statement = await localCreditCardStatements.getById(purchase.data.statementId);
						if (statement) {
							statement.data.totalAmount = Math.max(
								0,
								statement.data.totalAmount - purchase.data.installmentAmount,
							);
							await localCreditCardStatements.put(statement.data, statement.localId);
						}
						await localCreditPurchases.delete(purchase.localId);
					}
				}
				await localSubscriptions.delete(id);
				return;
			}
			await fetchWithAuth(`/subscriptions/${id}?deleteTransactions=${deleteTransactions}`, {
				method: "DELETE",
			});
			await localSubscriptions.delete(id);
		},
		async getAll(): Promise<Subscription[]> {
			if (isGuestMode()) {
				const local = await localSubscriptions.getAll();
				return local.map(item => item.data);
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const response = await fetchWithAuth<{ subscriptions: Subscription[] }>("/subscriptions");
			const subscriptions = response.subscriptions;
			cacheRemoteData(
				localSubscriptions.replaceSnapshot(
					subscriptions.map(s => ({ data: s, localId: s.id, syncedAt: Date.now() })),
					owner,
				),
			);
			return subscriptions;
		},

		async update(
			id: string,
			data: Omit<Partial<Subscription>, "debtSplit"> & { debtSplit?: DebtSplitInput | null },
		): Promise<Subscription> {
			if (isGuestMode()) {
				const { debtSplit: debtSplitInput, ...subscriptionChanges } = data;
				const existing = await localSubscriptions.getById(id);
				if (!existing) throw new Error("Subscription not found");
				const hasTagChanges = data.tagIds !== undefined || data.categoryId !== undefined;
				const tagIds = data.tagIds ?? (data.categoryId ? [data.categoryId] : []);
				const updated: Subscription = {
					...existing.data,
					...subscriptionChanges,
					...(debtSplitInput !== undefined && {
						debtSplit: await hydrateLocalDebtSplit(data.amount ?? existing.data.amount, debtSplitInput),
					}),
					...(hasTagChanges && { categoryId: tagIds[0], tagIds }),
				};
				await localSubscriptions.put(updated, id);
				return updated;
			}
			const subscription = await fetchWithAuth<Subscription>(`/subscriptions/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localSubscriptions.put(subscription, subscription.id);
			return subscription;
		},
	},

	// ============== SYNC ==============
	sync: {
		/**
		 * Clear all local data (useful when logging out)
		 */
		async clearLocalData(): Promise<void> {
			await clearAllLocalData();
		},

		/**
		 * Get the last sync timestamp
		 */
		async getLastSyncTime(): Promise<number | null> {
			const timestamp = await localMeta.get("lastSyncAt");
			return timestamp as number | null;
		},
		/**
		 * Sync local data with the server after logging in
		 * This uploads all local data and merges with server data
		 */
		async syncAll(): Promise<{ success: boolean; errors: string[] }> {
			const state = useAuthStore.getState();
			const owner = getCurrentCacheIdentity();
			if (!state.isAuthenticated || !owner?.startsWith("user:")) {
				return { errors: ["Usuário não autenticado"], success: false };
			}

			try {
				// Get all local data
				const [
					accounts,
					categories,
					creditCards,
					creditCardStatements,
					creditPurchases,
					recurringPayments,
					transactions,
					loans,
					debts,
					debtPeople,
					salaries,
					subscriptions,
					yieldHolidays,
					yields,
				] = await Promise.all([
					localAccounts.getAll(owner),
					localCategories.getAll(owner),
					localCreditCards.getAll(owner),
					localCreditCardStatements.getAll(owner),
					localCreditPurchases.getAll(owner),
					localRecurringPayments.getAll(owner),
					localTransactions.getAll(owner),
					localLoans.getAll(owner),
					localDebts.getAll(owner),
					localDebtPeople.getAll(owner),
					localSalaries.getAll(owner),
					localSubscriptions.getAll(owner),
					localMeta.get("financial-account-yield-holidays", owner),
					localMeta.get("financial-account-yields", owner),
				]);

				// Send to server
				const response = await fetchWithAuth<{
					syncResults: Record<string, { synced: number; errors: string[] }>;
					serverData: {
						financialAccounts: FinancialAccount[];
						financialAccountYieldHolidays: FinancialAccountYieldHoliday[];
						financialAccountYields: FinancialAccountYield[];
						categories: Category[];
						creditCards: CreditCard[];
						creditCardStatements: CreditCardStatement[];
						creditPurchases: CreditPurchase[];
						recurringPayments: RecurringPayment[];
						transactions: Transaction[];
						loans: Loan[];
						debts: Debt[];
						debtPeople: DebtPerson[];
						salaries: Salary[];
						subscriptions: Subscription[];
					};
				}>("/sync", {
					body: JSON.stringify({
						categories: categories.map(c => c.data),
						creditCardStatements: creditCardStatements.map(statement => statement.data),
						creditCards: creditCards.map(card => card.data),
						creditPurchases: creditPurchases.map(purchase => purchase.data),
						debtPeople: debtPeople.map(person => person.data),
						debts: debts.map(d => d.data),
						financialAccounts: accounts.map(a => a.data),
						financialAccountYieldHolidays: (yieldHolidays as FinancialAccountYieldHoliday[] | null) ?? [],
						financialAccountYields: ((yields as FinancialAccountYield[] | null) ?? []).filter(
							yieldEntry => yieldEntry.origin !== "SYSTEM",
						),
						loans: loans.map(l => l.data),
						recurringPayments: recurringPayments.map(payment => payment.data),
						salaries: salaries.map(s => normalizeSalary(s.data as LegacySalary)),
						subscriptions: subscriptions.map(s => s.data),
						transactions: transactions.map(t => t.data),
					}),
					method: "POST",
				});

				// Update local with server data
				await Promise.all([
					localAccounts.replaceSnapshot(
						response.serverData.financialAccounts.map(a => ({
							data: a,
							localId: a.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localMeta.set(
						"financial-account-yield-holidays",
						response.serverData.financialAccountYieldHolidays,
						owner,
					),
					localMeta.set("financial-account-yields", response.serverData.financialAccountYields, owner),
					localCategories.replaceSnapshot(
						response.serverData.categories.map(c => ({
							data: c,
							localId: c.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localCreditCards.replaceSnapshot(
						response.serverData.creditCards.map(card => ({
							data: card,
							localId: card.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localCreditCardStatements.replaceSnapshot(
						response.serverData.creditCardStatements.map(statement => ({
							data: statement,
							localId: statement.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localCreditPurchases.replaceSnapshot(
						response.serverData.creditPurchases.map(purchase => ({
							data: purchase,
							localId: purchase.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localRecurringPayments.replaceSnapshot(
						response.serverData.recurringPayments.map(payment => ({
							data: payment,
							localId: payment.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localTransactions.replaceSnapshot(
						response.serverData.transactions.map(t => ({
							data: t,
							localId: t.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localLoans.replaceSnapshot(
						response.serverData.loans.map(l => ({
							data: l,
							localId: l.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localDebts.replaceSnapshot(
						response.serverData.debts.map(d => ({
							data: d,
							localId: d.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localDebtPeople.replaceSnapshot(
						response.serverData.debtPeople.map(person => ({
							data: person,
							localId: person.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localSalaries.replaceSnapshot(
						response.serverData.salaries.map(s => ({
							data: s,
							localId: s.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
					localSubscriptions.replaceSnapshot(
						response.serverData.subscriptions.map(s => ({
							data: s,
							localId: s.id,
							syncedAt: Date.now(),
						})),
						owner,
					),
				]);

				// Save sync timestamp
				await localMeta.set("lastSyncAt", Date.now(), owner);

				// Collect errors
				const errors: string[] = [];
				for (const [_, result] of Object.entries(response.syncResults)) {
					errors.push(...result.errors);
				}

				return { errors, success: errors.length === 0 };
			} catch (error) {
				return {
					errors: [error instanceof Error ? error.message : "Falha na sincronização"],
					success: false,
				};
			}
		},
	},

	transactionImports: {
		async acceptTransferSuggestion(importId: string, itemId: string, counterpartItemId: string) {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ removedImportId: string; success: true }>(
				`/transaction-imports/${importId}/items/${itemId}/transfer-suggestions/${counterpartItemId}/accept`,
				{ method: "POST" },
			);
		},
		async approve(id: string): Promise<{ created: number }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number }>(`/transaction-imports/${id}/approve`, { method: "POST" });
		},
		async approveDay(importId: string, date: string): Promise<{ created: number }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number }>(`/transaction-imports/${importId}/days/${date}/approve`, {
				method: "POST",
			});
		},
		async approveItem(importId: string, itemId: string): Promise<{ created: number }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number }>(`/transaction-imports/${importId}/items/${itemId}/approve`, {
				method: "POST",
			});
		},
		async create({
			file,
			financialAccountId,
			provider,
		}: {
			file: File;
			financialAccountId: string;
			provider: TransactionImport["provider"];
		}): Promise<TransactionImportCreateResult> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			await assertFileIsAccessible(file);
			const form = new FormData();
			form.set("file", file);
			form.set("financialAccountId", financialAccountId);
			form.set("provider", provider);
			return fetchWithAuth<TransactionImportCreateResult>("/transaction-imports", {
				body: form,
				method: "POST",
			});
		},
		async delete(id: string): Promise<void> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			await fetchWithAuth(`/transaction-imports/${id}`, { method: "DELETE" });
		},
		async get(id: string): Promise<TransactionImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<TransactionImport>(`/transaction-imports/${id}`);
		},
		async getPending(): Promise<TransactionImport[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<TransactionImport[]>("/transaction-imports");
		},
		async reconcileItem(
			importId: string,
			itemId: string,
			data: {
				duplicateId: string;
				duplicateSource: "IMPORT_ITEM" | "TRANSACTION";
				sources: Record<string, "duplicate" | "imported">;
			},
		): Promise<TransactionImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<TransactionImport>(`/transaction-imports/${importId}/items/${itemId}/reconcile`, {
				body: JSON.stringify(data),
				method: "POST",
			});
		},
		async rejectTransferSuggestion(importId: string, itemId: string, counterpartItemId: string) {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ success: true }>(
				`/transaction-imports/${importId}/items/${itemId}/transfer-suggestions/${counterpartItemId}/reject`,
				{ method: "POST" },
			);
		},
		async updateItem(
			importId: string,
			itemId: string,
			data: Partial<
				Omit<
					Pick<
						TransactionImportItem,
						| "amount"
						| "date"
						| "debtSplit"
						| "description"
						| "destinationFinancialAccountId"
						| "isHidden"
						| "isSelected"
						| "originFinancialAccountId"
						| "storeName"
						| "tagIds"
						| "time"
						| "type"
					>,
					"debtSplit"
				> & { categoryId?: string | null; debtSplit?: DebtSplitInput | null }
			>,
		): Promise<TransactionImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<TransactionImport>(`/transaction-imports/${importId}/items/${itemId}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
		},
	},

	// ============== TRANSACTIONS ==============
	transactions: {
		async acceptTransferSuggestion(id: string, counterpartId: string): Promise<{ success: true }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para combinar transferências.");
			return fetchWithAuth(`/transactions/${id}/transfer-suggestions/${counterpartId}/accept`, {
				method: "POST",
			});
		},
		async create(
			data: Omit<Transaction, "createdAt" | "debtSplit" | "id"> & {
				debtSplit?: DebtSplitInput;
				matchDebtEventId?: string;
			},
		): Promise<Transaction> {
			if (isGuestMode()) {
				const { debtSplit: explicitDebtSplit, matchDebtEventId: _, ...localData } = data;
				const recurrenceOccurrenceDate = data.recurrenceId
					? (data.recurrenceOccurrenceDate ?? data.date)
					: undefined;
				const salaryOccurrenceDate = data.salaryId ? (data.salaryOccurrenceDate ?? data.date) : undefined;
				const subscriptionOccurrenceDate = data.subscriptionId
					? (data.subscriptionOccurrenceDate ?? data.date)
					: undefined;
				if (recurrenceOccurrenceDate || salaryOccurrenceDate || subscriptionOccurrenceDate) {
					const existing = (await localTransactions.getAll()).find(
						item =>
							(Boolean(recurrenceOccurrenceDate) &&
								item.data.recurrenceId === data.recurrenceId &&
								item.data.recurrenceOccurrenceDate === recurrenceOccurrenceDate) ||
							(Boolean(salaryOccurrenceDate) &&
								item.data.salaryId === data.salaryId &&
								item.data.salaryOccurrenceDate === salaryOccurrenceDate) ||
							(Boolean(subscriptionOccurrenceDate) &&
								item.data.subscriptionId === data.subscriptionId &&
								item.data.subscriptionOccurrenceDate === subscriptionOccurrenceDate),
					);
					if (existing) return existing.data;
				}
				const hasExplicitTags = data.tagIds !== undefined || data.categoryId !== undefined;
				const [recurringPayment, salary, subscription] = await Promise.all([
					data.recurrenceId ? localRecurringPayments.getById(data.recurrenceId) : undefined,
					data.salaryId ? localSalaries.getById(data.salaryId) : undefined,
					data.subscriptionId ? localSubscriptions.getById(data.subscriptionId) : undefined,
				]);
				const linkedRecurrence = recurringPayment?.data ?? salary?.data ?? subscription?.data;
				const debtSplit = explicitDebtSplit
					? await hydrateLocalDebtSplit(data.amount, explicitDebtSplit)
					: linkedRecurrence && "debtSplit" in linkedRecurrence
						? linkedRecurrence.debtSplit
						: undefined;
				const tagIds = hasExplicitTags
					? (data.tagIds ?? (data.categoryId ? [data.categoryId] : []))
					: (linkedRecurrence?.tagIds ?? (linkedRecurrence?.categoryId ? [linkedRecurrence.categoryId] : []));
				const newTransaction: Transaction = {
					...localData,
					categoryId: tagIds[0],
					createdAt: new Date().toISOString(),
					debtSplit,
					id: crypto.randomUUID(),
					recurrenceOccurrenceDate,
					salaryOccurrenceDate,
					subscriptionOccurrenceDate,
					tagIds,
					time: data.time === undefined ? getCurrentLocalTime() : data.time,
				};
				if (data.creditCardStatementId) {
					const storedStatement = await localCreditCardStatements.getById(data.creditCardStatementId);
					const statement = storedStatement?.data;
					if (!statement) throw new Error("Fatura não encontrada");
					const paidAmount = statement.paidAmount + data.amount;
					await localCreditCardStatements.put(
						{
							...statement,
							balanceAmount: statement.totalAmount - paidAmount,
							isPaid:
								statement.statementDate.slice(0, 10) <= getLocalDateKey() &&
								paidAmount >= statement.totalAmount,
							paidAmount,
						},
						statement.id,
					);
				}
				await localTransactions.put(newTransaction, newTransaction.id);
				return newTransaction;
			}
			const transaction = await fetchWithAuth<Transaction>("/transactions", {
				body: JSON.stringify(data),
				method: "POST",
			});
			await localTransactions.put(transaction, transaction.id);
			return transaction;
		},

		async delete(id: string): Promise<void> {
			if (isGuestMode()) {
				const existing = await localTransactions.getById(id);
				if (existing?.data.creditCardStatementId) {
					const storedStatement = await localCreditCardStatements.getById(
						existing.data.creditCardStatementId,
					);
					const statement = storedStatement?.data;
					if (!statement) throw new Error("Fatura não encontrada");
					const paidAmount = Math.max(0, statement.paidAmount - existing.data.amount);
					await localCreditCardStatements.put(
						{
							...statement,
							balanceAmount: statement.totalAmount - paidAmount,
							isPaid:
								statement.statementDate.slice(0, 10) <= getLocalDateKey() &&
								paidAmount >= statement.totalAmount,
							paidAmount,
						},
						statement.id,
					);
				}
				await localTransactions.delete(id);
				return;
			}
			await fetchWithAuth(`/transactions/${id}`, { method: "DELETE" });
			await localTransactions.delete(id);
		},
		async getAll(params?: {
			startDate?: string;
			endDate?: string;
			type?: Transaction["type"];
			categoryId?: string;
			financialAccountId?: string;
			limit?: number;
			offset?: number;
		}): Promise<Transaction[]> {
			if (isGuestMode()) {
				const [local, storedPurchases, storedStatements, storedCards, storedCategories, storedAccounts] =
					await Promise.all([
						localTransactions.getAll(),
						localCreditPurchases.getAll(),
						localCreditCardStatements.getAll(),
						localCreditCards.getAll(),
						localCategories.getAll(),
						localAccounts.getAll(),
					]);
				const statements = new Map(storedStatements.map(item => [item.data.id, item.data]));
				const cards = new Map(storedCards.map(item => [item.data.id, item.data]));
				const categories = new Map(storedCategories.map(item => [item.data.id, item.data]));
				const accounts = new Map(storedAccounts.map(item => [item.data.id, item.data]));
				const refundedPurchaseIds = new Set(
					storedPurchases.flatMap(item =>
						item.data.refundOfPurchaseId ? [item.data.refundOfPurchaseId] : [],
					),
				);
				const purchases: Transaction[] = storedPurchases
					.map(item => item.data)
					.filter(
						purchase =>
							purchase.currentInstallment === 1 &&
							(!params?.type || params.type === (purchase.isRefund ? "INCOME" : "EXPENSE")),
					)
					.flatMap(purchase => {
						const statement = statements.get(purchase.statementId);
						const card = statement ? cards.get(statement.creditCardId) : undefined;
						if (!card) return [];
						const tagIds = purchase.tagIds ?? (purchase.categoryId ? [purchase.categoryId] : []);
						const tags = tagIds.flatMap(tagId => {
							const tag = categories.get(tagId);
							return tag ? [tag] : [];
						});
						return [
							{
								amount: purchase.isRefund ? Math.abs(purchase.totalAmount) : purchase.totalAmount,
								categoryColor: tags[0]?.color ?? undefined,
								categoryId: purchase.categoryId,
								categoryName: tags[0]?.name,
								createdAt: purchase.purchaseDate,
								creditCardId: card.id,
								creditCardStatementId: purchase.statementId,
								currentInstallment: purchase.currentInstallment,
								date: purchase.purchaseDate,
								debtSplit: purchase.debtSplit,
								description: purchase.description,
								hasRefund: !purchase.isRefund && refundedPurchaseIds.has(purchase.id),
								id: purchase.id,
								installmentAmount: purchase.installmentAmount,
								installments: purchase.installments,
								isRefund: purchase.isRefund,
								originFinancialAccountId: card.financialAccountId,
								originName:
									card.accountName ||
									accounts.get(card.financialAccountId)?.name ||
									accounts.get(card.financialAccountId)?.institution?.name ||
									"Cartão de crédito",
								refundOfPurchaseId: purchase.refundOfPurchaseId,
								source: "CREDIT_CARD" as const,
								sourceName:
									card.accountName ||
									accounts.get(card.financialAccountId)?.institution?.name ||
									"Cartão de crédito",
								storeName: purchase.storeName,
								subscriptionId: purchase.subscriptionId,
								tagIds,
								tags,
								time: purchase.time,
								type: purchase.isRefund ? ("INCOME" as const) : ("EXPENSE" as const),
							},
						];
					});
				let transactions = [
					...local.map(item => {
						const originAccount = item.data.originFinancialAccountId
							? accounts.get(item.data.originFinancialAccountId)
							: undefined;
						const destinationAccount = item.data.destinationFinancialAccountId
							? accounts.get(item.data.destinationFinancialAccountId)
							: undefined;
						const originName = originAccount?.name || originAccount?.institution?.name;
						const destinationName = destinationAccount?.name || destinationAccount?.institution?.name;
						const paymentAccount = item.data.type === "INCOME" ? destinationAccount : originAccount;
						const paymentStatement = item.data.creditCardStatementId
							? statements.get(item.data.creditCardStatementId)
							: undefined;
						const paymentCard = paymentStatement ? cards.get(paymentStatement.creditCardId) : undefined;

						return {
							...item.data,
							creditCardName: paymentCard?.accountName,
							creditCardStatementDate: paymentStatement?.statementDate,
							destinationAccountRewardsKind: destinationAccount?.rewardsAccount?.kind,
							destinationAccountType: destinationAccount?.type,
							destinationName,
							originAccountRewardsKind: originAccount?.rewardsAccount?.kind,
							originAccountType: originAccount?.type,
							originName,
							source:
								item.data.type !== "TRANSFER" &&
								paymentAccount?.type === "CREDIT_CARD" &&
								!item.data.recurrenceId &&
								!item.data.salaryId &&
								!item.data.subscriptionId
									? ("CREDIT_CARD" as const)
									: ("FINANCIAL_ACCOUNT" as const),
							sourceName: item.data.type === "INCOME" ? destinationName : originName,
						};
					}),
					...purchases,
				];

				// Apply filters locally
				if (params?.startDate) {
					transactions = transactions.filter(t => t.date >= params.startDate!);
				}
				if (params?.endDate) {
					transactions = transactions.filter(t => t.date <= params.endDate!);
				}
				if (params?.type) {
					transactions = transactions.filter(t => t.type === params.type);
				}
				if (params?.categoryId) {
					transactions = transactions.filter(t =>
						(t.tagIds ?? (t.categoryId ? [t.categoryId] : [])).includes(params.categoryId!),
					);
				}
				if (params?.financialAccountId) {
					transactions = transactions.filter(
						t =>
							t.originFinancialAccountId === params.financialAccountId ||
							t.destinationFinancialAccountId === params.financialAccountId,
					);
				}

				transactions = sortTransactionsByMostRecent(transactions);

				// Apply pagination
				if (params?.offset) {
					transactions = transactions.slice(params.offset);
				}
				if (params?.limit) {
					transactions = transactions.slice(0, params.limit);
				}

				return transactions;
			}

			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const searchParams = new URLSearchParams();
			if (params) {
				for (const [key, value] of Object.entries(params)) {
					if (value !== undefined) {
						searchParams.append(key, String(value));
					}
				}
			}
			const query = searchParams.toString();
			const url = query ? `/transactions?${query}` : "/transactions";

			const transactions = await fetchWithAuth<Transaction[]>(url);
			const snapshot = transactions
				.filter(transaction => transaction.source !== "CREDIT_CARD")
				.map(t => ({ data: t, localId: t.id, syncedAt: Date.now() }));
			if (params && Object.values(params).some(value => value !== undefined))
				cacheRemoteData(localTransactions.bulkPut(snapshot, owner));
			else cacheRemoteData(localTransactions.replaceSnapshot(snapshot, owner));
			return transactions;
		},
		async getDailyPage(params: {
			endDate?: string;
			limit?: number;
			offset?: number;
			search?: string;
			startDate?: string;
		}): Promise<{
			days: Array<{ date: string; endingBalance: number; transactions: Transaction[] }>;
			hasMore: boolean;
			resultCount: number;
		}> {
			if (isGuestMode()) {
				const transactions = await this.getAll(params);
				const dates = [...new Set(transactions.map(transaction => transaction.date.slice(0, 10)))];
				return {
					days: dates.map(date => ({
						date,
						endingBalance: 0,
						transactions: transactions.filter(transaction => transaction.date.slice(0, 10) === date),
					})),
					hasMore: transactions.length > 0,
					resultCount: transactions.length,
				};
			}
			const searchParams = new URLSearchParams({ view: "daily" });
			for (const [key, value] of Object.entries(params)) {
				if (value !== undefined) searchParams.set(key, String(value));
			}
			return fetchWithAuth(`/transactions?${searchParams}`);
		},
		async getTransferSuggestions(): Promise<Array<{ counterpart: Transaction; transaction: Transaction }>> {
			if (isGuestMode()) return [];
			return fetchWithAuth("/transactions/transfer-suggestions");
		},
		async rejectTransferSuggestion(id: string, counterpartId: string): Promise<{ success: true }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para ignorar sugestões de transferência.");
			return fetchWithAuth(`/transactions/${id}/transfer-suggestions/${counterpartId}/reject`, {
				method: "POST",
			});
		},

		async update(
			id: string,
			data: Omit<Partial<Transaction>, "creditCardStatementId" | "debtSplit" | "storeName"> & {
				creditCardStatementId?: string | null;
				debtSplit?: DebtSplitInput | null;
				storeName?: string | null;
			},
		): Promise<Transaction> {
			if (isGuestMode()) {
				const { creditCardStatementId, debtSplit: debtSplitInput, ...transactionChanges } = data;
				const existing = await localTransactions.getById(id);
				if (!existing) throw new Error("Transação não encontrada");
				if (existing.data.creditCardStatementId) {
					const amount = data.amount ?? existing.data.amount;
					if (amount <= 0) throw new Error("Informe um valor maior que zero");
					const originFinancialAccountId =
						data.originFinancialAccountId ?? existing.data.originFinancialAccountId;
					if (!originFinancialAccountId) throw new Error("Selecione a conta pagadora");
					const storedStatement = await localCreditCardStatements.getById(
						existing.data.creditCardStatementId,
					);
					const statement = storedStatement?.data;
					if (!statement) throw new Error("Fatura não encontrada");
					const paidAmount =
						(Math.round(statement.paidAmount * 100) -
							Math.round(existing.data.amount * 100) +
							Math.round(amount * 100)) /
						100;
					const updatedStatement: CreditCardStatement = {
						...statement,
						balanceAmount: statement.totalAmount - paidAmount,
						isPaid:
							statement.statementDate.slice(0, 10) <= getLocalDateKey() &&
							paidAmount >= statement.totalAmount,
						paidAmount,
					};
					const updated: Transaction = {
						...existing.data,
						...transactionChanges,
						amount,
						originFinancialAccountId,
						...(creditCardStatementId !== undefined && {
							creditCardStatementId: creditCardStatementId ?? undefined,
						}),
						...(debtSplitInput !== undefined && {
							debtSplit: await hydrateLocalDebtSplit(amount, debtSplitInput),
						}),
					};
					await Promise.all([
						localCreditCardStatements.put(updatedStatement, updatedStatement.id),
						localTransactions.put(updated, id),
					]);
					return updated;
				}
				const updated: Transaction = {
					...existing.data,
					...transactionChanges,
					...(creditCardStatementId !== undefined && {
						creditCardStatementId: creditCardStatementId ?? undefined,
					}),
					...(debtSplitInput !== undefined && {
						debtSplit: await hydrateLocalDebtSplit(data.amount ?? existing.data.amount, debtSplitInput),
					}),
				};
				await localTransactions.put(updated, id);
				return updated;
			}
			const transaction = await fetchWithAuth<Transaction>(`/transactions/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
			await localTransactions.put(transaction, transaction.id);
			return transaction;
		},
	},
};
