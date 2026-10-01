import {
	addBookRefund,
	bookPurchase,
	type CreditBook,
	creditBookConsumption,
	creditBookEntries,
	creditBookRewards,
	ensureBookStatement,
	moneyCents,
	newBookPurchase,
	refinanceBookPurchase,
	refundDebtAmounts,
	removeBookRefund,
	replayCreditBook,
	updateBookPurchaseDate,
	updateBookRefund,
} from "@zaimu/finance/credit-book";
import {
	paymentStatement,
	recalculateStatementDueDate,
	statementCutoffAfter,
	toCents,
} from "@zaimu/finance/credit-card";
import { distributePurchaseCents } from "@zaimu/finance/credit-purchase";
import { loanInstallments } from "@zaimu/finance/loan";
import {
	nextRecurrenceDate,
	recurrenceAccountEffects,
	recurrenceDates,
	recurrenceNeedsConfiguration,
	shiftRecurrenceDate,
} from "@zaimu/finance/recurrence";
import { projectRecurrenceCreditBook } from "@zaimu/finance/recurrence-projection";
import { type CatalogPageOptions, localCatalogPage } from "./catalog-pagination";
import { hasUnresolvedLegacyCardPayment } from "./legacy-card-payments";
import { createLegacyRecurrenceService } from "./legacy-recurrence-service";
import {
	acknowledgeCreditBookSync,
	acknowledgeRecurrenceSync,
	localCreditBooks,
	localCreditRefundReviews,
	mutateLocalCreditBook,
	readLocalCreditBook,
	toPurchasePresentation,
	transferLocalCreditBookPurchase,
} from "./localStorage";
import type { Recurrence } from "./recurrence";
import { createRecurrenceService } from "./recurrence-service";
/**
 * Data Service - Abstracts local vs remote data operations
 *
 * When in guest mode: All operations use IndexedDB
 * When authenticated: Operations use backend API with local caching
 */

import { useAuthStore } from "@/stores/auth";
import type {
	Category,
	CategoryPage,
	CreditCard,
	CreditCardImport,
	CreditCardImportCreateResult,
	CreditCardImportItem,
	CreditCardImportSummary,
	CreditCardStatement,
	CreditCardStatementDetail,
	CreditCardStatementPage,
	CreditPurchase,
	Dashboard,
	Debt,
	DebtEvent,
	DebtInvitation,
	DebtInvitationPreview,
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
	LoanPayment,
	LoanPaymentPage,
	RecurringPayment,
	Salary,
	Store,
	StorePage,
	Subscription,
	Transaction,
	TransactionImport,
	TransactionImportCreateResult,
	TransactionImportItem,
	TransactionImportSummary,
} from "./api";
import type { BalanceAdjustment } from "./balance-adjustment";
import { calculateCreditCardLimit, getCurrentCreditCardStatement } from "./credit-card";
import { getCurrentLocalTime, getLocalDateKey } from "./date";
import { calculateDebtSplit, debtSplitToInput } from "./debt-split";
import {
	calculateFinancialAccountBalances,
	calculateFinancialAccountYieldEntries,
	getFinancialAccountOptionLabel,
} from "./financial-account";
import { normalizeInstitutionName } from "./financial-institution";
import {
	advanceLocalLoanInstallments,
	clearAllLocalData,
	createLocalLoanWithPayments,
	localAccounts,
	localCategories,
	localCreditCardStatements,
	localCreditCards,
	localDebtPeople,
	localDebts,
	localLoanPayments,
	localLoans,
	localMeta,
	localRecurrenceOccurrences,
	localRecurrences,
	localRecurringPayments,
	localSalaries,
	localStores,
	localSubscriptions,
	localTransactions,
	payLocalLoanInstallment,
	reviewLocalLoanPayments,
} from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";
import { getTransactionSearchText, normalizeTransactionSearch } from "./transaction-search";
import { sortTransactionsByMostRecent } from "./transaction-sort";
import { assertFileIsAccessible } from "./upload-file";

export interface FinancialAccountYieldPage {
	hasMore: boolean;
	items: FinancialAccountYield[];
	nextCursor: null | string;
}

export interface DebtEventPage {
	hasMore: boolean;
	items: DebtEvent[];
	nextCursor: null | string;
}

const API_URL = import.meta.env.VITE_API_URL || "http://localhost:3333";

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
	isHidden?: boolean;
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
	let response: Response;
	try {
		response = await fetch(`${API_URL}${endpoint}`, {
			...options,
			credentials: "include",
			headers: {
				...(options.body instanceof FormData ? {} : { "Content-Type": "application/json" }),
				...options.headers,
			},
		});
	} catch (error) {
		throw new ConnectivityError("Servidor indisponível.", { cause: error });
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
async function withGuestCardPayments(cardId: string, _statements: CreditCardStatement[]) {
	const book = await readLocalCreditBook(cardId);
	return replayCreditBook(book).statements.map(statement => ({
		...statement,
		totalAmount: Number(statement.totalAmount) + statement.chargesAmount,
	}));
}

const recurrenceService = createRecurrenceService({
	fetchWithAuth,
	getUserId,
	hydrateLocalDebtSplit,
	isGuestMode,
});

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
			return (await dataService.accounts.getAllIncludingHidden()).filter(account => !account.isHidden);
		},
		async getAllIncludingHidden(): Promise<FinancialAccount[]> {
			if (isGuestMode()) {
				const [local, transactions, cashbackPurchases, holidays, yields] = await Promise.all([
					localAccounts.getAll(),
					localTransactions.getAll(),
					localCreditBooks.getAll(),
					localMeta.get("financial-account-yield-holidays"),
					localMeta.get("financial-account-yields"),
				]);
				const accounts = calculateFinancialAccountBalances(
					local.map(item => normalizeLegacyFinancialAccount(item.data)),
					transactions.map(item => item.data),
					cashbackPurchases.flatMap(item => creditBookRewards(item.data)),
					(holidays as FinancialAccountYieldHoliday[] | null)?.map(holiday => holiday.date) ?? [],
					undefined,
					(yields as FinancialAccountYield[] | null) ?? [],
				);
				return accounts;
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
				if (updated.creditCard && data.creditCard) {
					const card = updated.creditCard;
					await localCreditCards.put(card, card.id);
					if (
						card.dueDay !== existing.data.creditCard?.dueDay ||
						card.statementDay !== existing.data.creditCard?.statementDay ||
						card.workingDueDate !== existing.data.creditCard?.workingDueDate
					)
						await mutateLocalCreditBook(card.id, book => {
							for (const statement of book.statements)
								statement.dueDate = recalculateStatementDueDate(
									book.card,
									statement.statementDate,
									statement.dueDate,
									existing.data.creditCard!,
								);
						});
				}
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
			isHidden?: boolean;
			time?: string | null;
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
				isHidden: data.isHidden ?? false,
				kind: "MANUAL",
				time: data.time ?? null,
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
		async getDisplayPage(
			financialAccountId?: string,
			cursor?: string,
			filters: { startDate?: string; endDate?: string; visibility?: "hidden" | "visible" } = {},
		) {
			if (!isGuestMode()) {
				const page = await dataService.accountYields.getPage(financialAccountId, cursor, 100, {
					...filters,
					positiveOnly: true,
				});
				return {
					...page,
					accountNames: page.items.map(row => [row.financialAccountId, row.accountName ?? "Conta"] as const),
					items: page.items.map(row => ({ ...row, amount: row.amount ?? 0, date: row.date.slice(0, 10) })),
				};
			}
			const [accounts, transactions, holidays, yields] = await Promise.all([
				dataService.accounts.getAll(),
				dataService.transactions.getAll(),
				dataService.accountYieldHolidays.getAll(),
				localMeta.get("financial-account-yields"),
			]);
			const entries = accounts
				.filter(account => !financialAccountId || account.id === financialAccountId)
				.flatMap(account =>
					calculateFinancialAccountYieldEntries(
						account,
						transactions.filter(row => row.source !== "CREDIT_CARD"),
						holidays.map(row => row.date),
						undefined,
						((yields ?? []) as FinancialAccountYield[]).filter(row => row.financialAccountId === account.id),
					),
				)
				.filter(
					row =>
						(!filters.startDate || row.date >= filters.startDate) &&
						(!filters.endDate || row.date <= filters.endDate) &&
						(!filters.visibility || Boolean(row.isHidden) === (filters.visibility === "hidden")),
				)
				.toSorted(
					(a, b) => b.date.localeCompare(a.date) || b.kind.localeCompare(a.kind) || b.id.localeCompare(a.id),
				);
			const hash = JSON.stringify({ filters, financialAccountId, owner: getUserId() });
			let offset = 0;
			if (cursor) {
				const parsed = JSON.parse(atob(cursor));
				if (parsed.hash !== hash || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0)
					throw new Error("Cursor inválido");
				offset = parsed.offset;
			}
			const items = entries.slice(offset, offset + 100);
			const hasMore = offset + items.length < entries.length;
			return {
				accountNames: accounts.map(account => [account.id, getFinancialAccountOptionLabel(account)] as const),
				hasMore,
				items,
				nextCursor: hasMore ? btoa(JSON.stringify({ hash, offset: offset + items.length })) : null,
			};
		},
		async getPage(
			financialAccountId?: string,
			cursor?: null | string,
			limit = 100,
			filters: {
				startDate?: string;
				endDate?: string;
				visibility?: "hidden" | "visible";
				positiveOnly?: boolean;
			} = {},
		): Promise<FinancialAccountYieldPage> {
			if (!isGuestMode()) {
				const params = new URLSearchParams({ limit: String(limit) });
				if (financialAccountId) params.set("financialAccountId", financialAccountId);
				if (cursor) params.set("cursor", cursor);
				for (const [key, value] of Object.entries(filters))
					if (value !== undefined) params.set(key, String(value));
				return fetchWithAuth<FinancialAccountYieldPage>(`/financial-account-yields?${params}`);
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			const sorted = yields
				.filter(yieldEntry => !financialAccountId || yieldEntry.financialAccountId === financialAccountId)
				.toSorted(
					(left, right) =>
						right.date.localeCompare(left.date) ||
						right.kind.localeCompare(left.kind) ||
						right.id.localeCompare(left.id),
				);
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite inválido");
			const hash = JSON.stringify({ filters, financialAccountId, owner: getUserId() });
			let offset = 0;
			if (cursor) {
				try {
					const parsed = JSON.parse(atob(cursor));
					if (parsed.hash !== hash || !Number.isSafeInteger(parsed.offset) || parsed.offset < 0)
						throw new Error();
					offset = parsed.offset;
				} catch {
					throw new Error("Cursor inválido para estes filtros");
				}
			}
			const filtered = sorted.filter(
				row =>
					(!filters.startDate || row.date.slice(0, 10) >= filters.startDate) &&
					(!filters.endDate || row.date.slice(0, 10) <= filters.endDate) &&
					(!filters.visibility || Boolean(row.isHidden) === (filters.visibility === "hidden")) &&
					(!filters.positiveOnly || (!row.isExcluded && (row.amount ?? 0) > 0)),
			);
			const items = filtered.slice(offset, offset + limit);
			const nextOffset = offset + items.length;
			return {
				hasMore: nextOffset < filtered.length,
				items,
				nextCursor: nextOffset < filtered.length ? btoa(JSON.stringify({ hash, offset: nextOffset })) : null,
			};
		},
		async update(
			id: string,
			data: { amount: number; date: string; isHidden: boolean; time: string | null },
		): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/financial-account-yields/${id}`, {
					body: JSON.stringify(data),
					method: "PATCH",
				});
				return;
			}
			const yields =
				((await localMeta.get("financial-account-yields")) as FinancialAccountYield[] | null) ?? [];
			await localMeta.set(
				"financial-account-yields",
				yields.map(yieldEntry => (yieldEntry.id === id ? { ...yieldEntry, ...data } : yieldEntry)),
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

	// ============== TRANSACTIONS ==============
	balanceAdjustments: {
		async create(data: Pick<BalanceAdjustment, "balance" | "date" | "financialAccountId">) {
			if (isGuestMode()) throw new Error("Entre na sua conta para registrar ajustes de saldo.");
			return fetchWithAuth<BalanceAdjustment>("/balance-adjustments", {
				body: JSON.stringify(data),
				method: "POST",
			});
		},
		async delete(id: string) {
			if (isGuestMode()) throw new Error("Entre na sua conta para excluir ajustes de saldo.");
			return fetchWithAuth<{ success: true }>(`/balance-adjustments/${id}`, { method: "DELETE" });
		},
		async getAll(): Promise<BalanceAdjustment[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth("/balance-adjustments");
		},
		async update(id: string, data: Pick<BalanceAdjustment, "balance" | "date" | "financialAccountId">) {
			if (isGuestMode()) throw new Error("Entre na sua conta para alterar ajustes de saldo.");
			return fetchWithAuth<BalanceAdjustment>(`/balance-adjustments/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
		},
	},

	// ============== CATEGORIES ==============
	categories: {
		async create(data: Omit<Category, "id" | "userId">): Promise<Category> {
			const userId = getUserId();
			if (isGuestMode()) {
				const existing = (await localCategories.getAll()).find(
					row => row.data.name.toLocaleLowerCase("pt-BR") === data.name.toLocaleLowerCase("pt-BR"),
				);
				if (existing) return existing.data;
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
		async getByIds(ids: string[]): Promise<Category[]> {
			const selected = [...new Set(ids)].sort();
			if (!selected.length) return [];
			if (isGuestMode())
				return (await localCategories.getAll()).map(row => row.data).filter(row => selected.includes(row.id));
			return fetchWithAuth<Category[]>(
				`/categories/lookup?${new URLSearchParams({ ids: selected.join(",") })}`,
			);
		},
		async getPage(options: CatalogPageOptions = {}): Promise<CategoryPage> {
			if (isGuestMode())
				return localCatalogPage(
					(await localCategories.getAll()).map(row => row.data),
					getUserId(),
					"categories",
					options,
				);
			const query = new URLSearchParams();
			if (options.cursor) query.set("cursor", options.cursor);
			if (options.search) query.set("search", options.search);
			if (options.limit !== undefined) query.set("limit", String(options.limit));
			return fetchWithAuth<CategoryPage>(`/categories?${query}`);
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
		async approveRefund(
			importId: string,
			itemId: string,
			data: {
				purchaseId?: string;
				purchase?: {
					description: string;
					storeName?: string;
					purchaseDate: string;
					totalAmount: number;
					installments: number;
					tagIds?: string[];
				};
				policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
			},
		): Promise<{ created: number; finished: boolean }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para revisar reembolsos.");
			return fetchWithAuth(`/credit-card-imports/${importId}/items/${itemId}/approve-refund`, {
				body: JSON.stringify(data),
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
		async get(id: string, cursor?: string): Promise<CreditCardImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar faturas.");
			const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return fetchWithAuth<CreditCardImport>(`/credit-card-imports/${id}${suffix}`);
		},
		async getPending(): Promise<CreditCardImportSummary[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<CreditCardImportSummary[]>("/credit-card-imports");
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
		async refundSources(importId: string): Promise<
			Array<{
				id: string;
				description: string;
				purchaseDate: string;
				totalAmount: number;
				refundableAmount: number;
				installments: number;
			}>
		> {
			if (isGuestMode()) throw new Error("Conecte sua conta para revisar reembolsos.");
			return fetchWithAuth(`/credit-card-imports/${importId}/refund-sources`);
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
						| "isStatementCharge"
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
				isStatementCharge?: boolean;
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
			let purchaseId = "";
			await mutateLocalCreditBook(cardId, book => {
				if (data.isStatementCharge) {
					if (data.debtSplit || (data.installments ?? 1) !== 1)
						throw new Error("Encargos não permitem rateio ou parcelamento");
					const statement = ensureBookStatement(book, data.purchaseDate);
					purchaseId = crypto.randomUUID();
					book.charges.push({
						amountCents: moneyCents(data.totalAmount, 1),
						chargeDate: data.purchaseDate,
						description: data.description ?? "Encargo",
						externalId: null,
						id: purchaseId,
						isSettled: false,
						settledByPurchaseId: null,
						statementId: statement.id,
						time: data.time ?? getCurrentLocalTime(),
					});
					return;
				}
				const existing = data.subscriptionId
					? book.purchases.find(
							p =>
								p.subscriptionId === data.subscriptionId &&
								p.subscriptionOccurrenceDate === data.subscriptionOccurrenceDate,
						)
					: null;
				if (existing) {
					purchaseId = existing.id;
					return;
				}
				const p = newBookPurchase(book, {
					...data,
					cashbackAccountId: card.cashbackAccountId ?? null,
					cashbackAmount:
						card.cashbackAccountId && card.cashbackRate
							? Number(((data.totalAmount * card.cashbackRate) / 100).toFixed(4))
							: null,
					cashbackYieldPeriod: card.cashbackYieldPeriod ?? null,
					cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage ?? null,
					cashbackYieldReferenceRate: card.cashbackYieldReferenceRate ?? null,
					categoryId: data.categoryId ?? null,
					debtSplitRule: data.debtSplit ?? null,
					description: data.description ?? "",
					installments: data.installments ?? 1,
					storeName: data.storeName ?? null,
					tagIds: data.tagIds ?? [],
					time: data.time ?? getCurrentLocalTime(),
				});
				purchaseId = p.id;
			});
			return creditBookEntries(await readLocalCreditBook(cardId))
				.filter(row => row.purchaseId === purchaseId || row.id === purchaseId)
				.map(toPurchasePresentation);
		},
		async approveRefundReview(
			cardId: string,
			reviewId: string,
			data: {
				purchaseId?: string;
				purchase?: {
					description: string;
					storeName?: string;
					purchaseDate: string;
					totalAmount: number;
					installments: number;
					tagIds?: string[];
				};
				policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";
			},
		): Promise<void> {
			if (!isGuestMode()) {
				await fetchWithAuth(`/credit-cards/${cardId}/refund-reviews/${reviewId}/approve`, {
					body: JSON.stringify(data),
					method: "POST",
				});
				return;
			}
			const review = (await localCreditRefundReviews.getById(reviewId))?.data;
			if (!review || review.creditCardId !== cardId) throw new Error("Reembolso pendente não encontrado");
			await mutateLocalCreditBook(
				cardId,
				book => {
					const purchase = data.purchaseId
						? book.purchases.find(p => p.id === data.purchaseId)
						: data.purchase
							? newBookPurchase(book, {
									...data.purchase,
									storeName: data.purchase.storeName ?? null,
									tagIds: data.purchase.tagIds ?? [],
								})
							: null;
					if (!purchase) throw new Error("Vincule ou revise a compra original");
					const original = review.original;
					const refund = addBookRefund(book, purchase.id, {
						amount: Math.abs(original.totalAmount),
						creditDate: original.purchaseDate.slice(0, 10),
						id: reviewId,
						policy: data.policy,
					});
					refund.time = original.time ?? null;
				},
				undefined,
				reviewId,
			);
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
				currentStatement: null,
				dueDay: details.dueDay,
				excludeFromTotals: details.excludeFromTotals ?? false,
				financialAccountId: account.id,
				id: crypto.randomUUID(),
				limit: {
					availableLimit: details.creditLimit,
					effectiveLimit: details.creditLimit,
					temporaryCredit: 0,
					usedLimit: 0,
				},
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
			await mutateLocalCreditBook(cardId, book => {
				const r = book.refunds.find(r => r.id === purchaseId);
				if (r) {
					removeBookRefund(book, r.purchaseId, r.id);
					return;
				}
				if (book.charges.some(ch => ch.id === purchaseId)) {
					book.deletedChargeIds = [...new Set([...(book.deletedChargeIds ?? []), purchaseId])];
					book.charges = book.charges.filter(ch => ch.id !== purchaseId);
					return;
				}
				const id = book.installments.find(i => i.id === purchaseId)?.purchaseId ?? purchaseId;
				bookPurchase(book, id);
				book.deletedPurchaseIds = [...new Set([...(book.deletedPurchaseIds ?? []), id])];
				book.purchases = book.purchases.filter(p => p.id !== id);
				book.installments = book.installments.filter(i => i.purchaseId !== id);
				book.refunds = book.refunds.filter(r => r.purchaseId !== id);
			});
		},
		async getAll(): Promise<CreditCard[]> {
			if (isGuestMode()) {
				const [storedCards, storedAccounts, storedStatements] = await Promise.all([
					localCreditCards.getAll(),
					localAccounts.getAll(),
					localCreditCardStatements.getAll(),
				]);
				const accounts = new Map(storedAccounts.map(item => [item.data.id, item.data]));
				const statementsByCard = Map.groupBy(
					storedStatements.map(item => item.data),
					statement => statement.creditCardId,
				);
				return Promise.all(
					storedCards
						.filter(({ data: card }) => !accounts.get(card.financialAccountId)?.isHidden)
						.map(async ({ data: card }) => {
							const statements = await withGuestCardPayments(card.id, statementsByCard.get(card.id) ?? []);
							return {
								...card,
								accountName:
									card.accountName ||
									accounts.get(card.financialAccountId)?.name ||
									accounts.get(card.financialAccountId)?.institution?.name ||
									null,
								currentStatement: getCurrentCreditCardStatement(statements, card) ?? null,
								limit: calculateCreditCardLimit(card, statements),
							};
						}),
				);
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
		async getBook(cardId: string): Promise<CreditBook> {
			return isGuestMode()
				? readLocalCreditBook(cardId)
				: fetchWithAuth<CreditBook>(`/credit-cards/${cardId}/book`);
		},
		async getRefundReviews(
			cardId: string,
		): Promise<Array<{ id: string; original: CreditPurchase; creditCardId: string }>> {
			if (!isGuestMode())
				return (
					await fetchWithAuth<Array<{ id: string; original: CreditPurchase }>>(
						`/credit-cards/${cardId}/refund-reviews`,
					)
				).map(row => ({ ...row, creditCardId: cardId }));
			return (await localCreditRefundReviews.getAll())
				.filter(row => !row.deleted && row.data.creditCardId === cardId)
				.map(row => ({ creditCardId: cardId, id: row.localId, original: row.data.original }));
		},
		async getStatement(cardId: string, statementId: string): Promise<CreditCardStatementDetail> {
			if (!isGuestMode())
				return fetchWithAuth<CreditCardStatementDetail>(`/credit-cards/${cardId}/statements/${statementId}`);
			const book = projectRecurrenceCreditBook(
				await readLocalCreditBook(cardId),
				await dataService.recurrences.getAll(),
				shiftRecurrenceDate(getLocalDateKey(), 1),
				`${new Date().getFullYear() + 2}-12-31`,
			);
			const statements = replayCreditBook(book).statements;
			const statement = statements.find(s => s.id === statementId);
			if (!statement) throw new Error("Fatura não encontrada");
			const categories = new Map((await localCategories.getAll()).map(row => [row.data.id, row.data]));
			const purchases = await Promise.all(
				creditBookEntries(book)
					.filter(row => row.statementId === statement.id)
					.map(async row => {
						const p = toPurchasePresentation(row);
						const rule = row.purchaseId
							? book.purchases.find(p => p.id === row.purchaseId)?.debtSplitRule
							: null;
						return {
							...p,
							debtSplit: rule
								? await hydrateLocalDebtSplit(
										bookPurchase(book, row.purchaseId!).totalAmountCents / 100,
										rule,
									)
								: null,
							tagIds: p.tagIds ?? [],
							tags: (p.tagIds ?? []).flatMap(id => {
								const tag = categories.get(id);
								return tag ? [tag] : [];
							}),
						};
					}),
			);
			const payments = (await localTransactions.getAll())
				.filter(
					row =>
						!row.deleted &&
						row.data.paymentCreditCardId === cardId &&
						paymentStatement(statements, row.data.date)?.id === statement.id,
				)
				.map(row => row.data);
			return {
				...statement,
				payments,
				purchases,
				totalAmount: Number(statement.totalAmount) + statement.chargesAmount,
			} as CreditCardStatementDetail;
		},
		async getStatementPage(
			cardId: string,
			options: { cursor?: string; isPaid?: boolean; limit?: number } = {},
		): Promise<CreditCardStatementPage> {
			if (isGuestMode()) {
				const rows = replayCreditBook(
					projectRecurrenceCreditBook(
						await readLocalCreditBook(cardId),
						await dataService.recurrences.getAll(),
						shiftRecurrenceDate(getLocalDateKey(), 1),
						`${new Date().getFullYear() + 2}-12-31`,
					),
				)
					.statements.filter(s => options.isPaid === undefined || s.isPaid === options.isPaid)
					.toSorted((a, b) => b.statementDate.localeCompare(a.statementDate) || b.id.localeCompare(a.id));
				const start = options.cursor ? Math.max(0, rows.findIndex(s => s.id === options.cursor) + 1) : 0;
				const limit = options.limit ?? 24;
				const items = rows
					.slice(start, start + limit)
					.map(s => ({ ...s, totalAmount: Number(s.totalAmount) + s.chargesAmount }));
				return {
					hasMore: start + items.length < rows.length,
					items,
					nextCursor: start + items.length < rows.length ? (items.at(-1)?.id ?? null) : null,
				};
			}
			const owner = getCurrentCacheIdentity();
			if (!owner) throw new Error("Identidade local indisponível.");
			const search = new URLSearchParams();
			if (options.cursor) search.set("cursor", options.cursor);
			if (options.isPaid !== undefined) search.set("isPaid", String(options.isPaid));
			if (options.limit !== undefined) search.set("limit", String(options.limit));
			const suffix = search.size ? `?${search}` : "";
			const page = await fetchWithAuth<CreditCardStatementPage>(
				`/credit-cards/${cardId}/statements${suffix}`,
			);
			cacheRemoteData(
				localCreditCardStatements.bulkPut(
					page.items.map(statement => ({
						data: statement,
						localId: statement.id,
						syncedAt: Date.now(),
					})),
					owner,
				),
			);
			return page;
		},
		async getStatements(cardId: string, isPaid?: boolean): Promise<CreditCardStatement[]> {
			const statements: CreditCardStatement[] = [];
			let cursor: string | undefined;
			do {
				const page = await this.getStatementPage(cardId, { cursor, isPaid, limit: 100 });
				statements.push(...page.items);
				cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
			} while (cursor);
			if (!isGuestMode()) {
				const owner = getCurrentCacheIdentity();
				if (!owner) throw new Error("Identidade local indisponível.");
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
			}
			return statements;
		},
		async payCard(
			cardId: string,
			data: { amount: number; date: string; financialAccountId: string; time?: string | null },
		): Promise<{ transaction: Transaction }> {
			if (!isGuestMode()) {
				const result = await fetchWithAuth<{ transaction: Transaction }>(`/credit-cards/${cardId}/payments`, {
					body: JSON.stringify(data),
					method: "POST",
				});
				await localTransactions.put(result.transaction, result.transaction.id);
				return result;
			}
			const [card, account] = await Promise.all([
				localCreditCards.getById(cardId),
				localAccounts.getById(data.financialAccountId),
			]);
			if (!card) throw new Error("Cartão não encontrado");
			if (!account || account.data.type === "CREDIT_CARD" || account.data.type === "REWARDS")
				throw new Error("Selecione uma conta com saldo próprio");
			if (data.amount <= 0) throw new Error("Informe um valor maior que zero");
			const transaction: Transaction = {
				amount: data.amount,
				createdAt: new Date().toISOString(),
				date: data.date,
				description: "Pagamento do cartão",
				id: crypto.randomUUID(),
				originFinancialAccountId: data.financialAccountId,
				paymentCreditCardId: cardId,
				time: data.time === undefined ? getCurrentLocalTime() : data.time,
				type: "EXPENSE",
			};
			await localTransactions.put(transaction, transaction.id);
			return { transaction };
		},
		async refinancePurchase(
			cardId: string,
			purchaseId: string,
			data: { feeAmount: number; installments: number; purchaseDate: string },
		): Promise<{ purchases: CreditPurchase[]; settledAmount: number; totalAmount: number }> {
			if (isGuestMode()) {
				const result = await mutateLocalCreditBook(cardId, book =>
					refinanceBookPurchase(
						book,
						book.installments.find(i => i.id === purchaseId)?.purchaseId ?? purchaseId,
						data,
					),
				);
				return {
					...result,
					purchases: creditBookEntries(await readLocalCreditBook(cardId)).map(toPurchasePresentation),
				};
			}
			return fetchWithAuth(`/credit-cards/${cardId}/purchases/${purchaseId}/refinance`, {
				body: JSON.stringify(data),
				method: "POST",
			});
		},
		async refundPurchase(
			cardId: string,
			purchaseId: string,
			data: { amount?: number; date?: string; policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS" },
		): Promise<CreditPurchase> {
			const date = data.date ?? new Date().toISOString().slice(0, 10);
			if (!isGuestMode())
				return fetchWithAuth<CreditPurchase>(`/credit-cards/${cardId}/purchases/${purchaseId}/refunds`, {
					body: JSON.stringify({ amount: data.amount, policy: data.policy, purchaseDate: date }),
					method: "POST",
				});
			const refund = await mutateLocalCreditBook(cardId, book =>
				addBookRefund(book, book.installments.find(i => i.id === purchaseId)?.purchaseId ?? purchaseId, {
					amount: data.amount,
					creditDate: date,
					policy: data.policy,
				}),
			);
			return toPurchasePresentation(
				creditBookEntries(await readLocalCreditBook(cardId)).find(row => row.id === refund.id)!,
			);
		},
		async setStatementCutoff(cardId: string, statementDate: string | null): Promise<void> {
			if (isGuestMode()) {
				const stored = await localCreditCards.getById(cardId);
				if (!stored) throw new Error("Cartão não encontrado.");
				if (statementDate) {
					const statement = (await this.getStatements(cardId)).find(
						row => !row.isForecast && row.statementDate.slice(0, 10) === statementDate,
					);
					if (!statement) throw new Error("Fatura não encontrada.");
				}
				await localCreditCards.put(
					{
						...stored.data,
						ignoreStatementsBefore: statementDate ? statementCutoffAfter(statementDate) : null,
					},
					cardId,
				);
				return;
			}
			await fetchWithAuth(`/credit-cards/${cardId}/statement-cutoff`, {
				body: JSON.stringify({ statementDate }),
				method: "PATCH",
			});
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
			const destinationCardId = "creditCardId" in data ? (data.creditCardId ?? cardId) : cardId;
			const update = (book: CreditBook) => {
				const id = book.installments.find(i => i.id === purchaseId)?.purchaseId ?? purchaseId;
				const p = bookPurchase(book, id);
				if ("installmentAmount" in data) {
					const i = book.installments.find(i => i.id === purchaseId);
					if (!i) throw new Error("Parcela não encontrada");
					const amounts = [...p.installmentAmountsCents];
					amounts[i.number - 1] = moneyCents(data.installmentAmount, 1);
					p.installmentAmountsCents = amounts;
					p.totalAmountCents = amounts.reduce((a, b) => a + b, 0);
					i.amountCents = amounts[i.number - 1]!;
				} else {
					const count = data.installments ?? p.installmentAmountsCents.length;
					if (book.installments.some(i => i.purchaseId === p.id && i.number > count))
						throw new Error("Parcelas históricas não podem ser removidas");
					const total = moneyCents(data.totalAmount ?? p.totalAmountCents / 100, 1);
					if (data.totalAmount !== undefined || data.installments !== undefined) {
						p.installmentAmountsCents = distributePurchaseCents(
							total,
							count,
							new Map(
								book.installments
									.filter(i => i.purchaseId === p.id && i.hasImportedAmount)
									.map(i => [i.number, i.amountCents]),
							),
						);
						p.totalAmountCents = total;
						for (const i of book.installments.filter(i => i.purchaseId === p.id))
							i.amountCents = p.installmentAmountsCents[i.number - 1]!;
					}
					if (data.description !== undefined) p.description = data.description;
					if (data.storeName !== undefined) p.storeName = data.storeName ?? null;
					if (data.purchaseDate !== undefined) updateBookPurchaseDate(book, p.id, data.purchaseDate);
					if (data.time !== undefined) p.time = data.time;
					if (data.tagIds !== undefined) p.tagIds = data.tagIds;
					if (data.debtSplit !== undefined) p.debtSplitRule = data.debtSplit;
					if (data.feeAmount !== undefined) {
						p.feeAmount = data.feeAmount || null;
						p.feeDescription = data.feeAmount ? (data.feeDescription ?? p.feeDescription) : null;
					}
				}
				p.updatedAt = new Date().toISOString();
			};
			if (destinationCardId === cardId) await mutateLocalCreditBook(cardId, update);
			else {
				await transferLocalCreditBookPurchase(cardId, destinationCardId, purchaseId, (book, card) => {
					update(book);
					const rootId = book.installments.find(item => item.id === purchaseId)?.purchaseId ?? purchaseId;
					const purchase = bookPurchase(book, rootId);
					purchase.cashbackAccountId = card.cashbackAccountId ?? null;
					purchase.cashbackAmount =
						card.cashbackAccountId && card.cashbackRate
							? Number((((purchase.totalAmountCents / 100) * card.cashbackRate) / 100).toFixed(4))
							: null;
					purchase.cashbackYieldPeriod = card.cashbackYieldPeriod ?? null;
					purchase.cashbackYieldReferencePercentage = card.cashbackYieldReferencePercentage ?? null;
					purchase.cashbackYieldReferenceRate = card.cashbackYieldReferenceRate ?? null;
				});
			}

			return toPurchasePresentation(
				creditBookEntries(await readLocalCreditBook(destinationCardId)).find(
					row => row.id === purchaseId || row.purchaseId === purchaseId,
				)!,
			);
		},
		async updateRefund(
			cardId: string,
			purchaseId: string,
			refundId: string,
			data: { amount: number; date: string },
		): Promise<CreditPurchase> {
			if (!isGuestMode())
				return fetchWithAuth<CreditPurchase>(
					`/credit-cards/${cardId}/purchases/${purchaseId}/refunds/${refundId}`,
					{ body: JSON.stringify({ amount: data.amount, purchaseDate: data.date }), method: "PATCH" },
				);
			await mutateLocalCreditBook(cardId, book =>
				updateBookRefund(book, purchaseId, refundId, { amount: data.amount, creditDate: data.date }),
			);
			return toPurchasePresentation(
				creditBookEntries(await readLocalCreditBook(cardId)).find(row => row.id === refundId)!,
			);
		},
	},

	// ============== DASHBOARD ==============
	dashboard: {
		async get(dateRange?: { endDate?: string; startDate?: string }): Promise<Dashboard> {
			if (isGuestMode()) {
				const [accounts, transactions, loans, debts, recurrences, cards, rawStatements] = await Promise.all([
					dataService.accounts.getAll(),
					dataService.transactions.getAll(),
					dataService.loans.getAll(),
					dataService.debts.getAll(),
					dataService.recurrences.getAll(),
					dataService.creditCards.getAll(),
					localCreditCardStatements.getAll().then(items => items.map(item => item.data)),
				]);
				const statements = (
					await Promise.all(
						cards.map(async card =>
							withGuestCardPayments(
								card.id,
								rawStatements.filter(item => item.creditCardId === card.id),
							),
						),
					)
				).flat();
				const now = new Date();
				const rangeStart = new Date(
					`${dateRange?.startDate ?? `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-01`}T00:00:00`,
				);
				const rangeEnd = new Date(
					`${dateRange?.endDate ?? new Date(now.getFullYear(), now.getMonth() + 1, 0).toISOString().slice(0, 10)}T23:59:59`,
				);
				const [accountRecords, cashbackPurchases, holidays, yields] = await Promise.all([
					localAccounts.getAll(),
					localCreditBooks.getAll(),
					localMeta.get("financial-account-yield-holidays"),
					localMeta.get("financial-account-yields"),
				]);
				const accountsAtRangeEnd = calculateFinancialAccountBalances(
					accountRecords
						.filter(item => !item.data.isHidden)
						.map(item => normalizeLegacyFinancialAccount(item.data)),
					transactions,
					cashbackPurchases.flatMap(item => creditBookRewards(item.data)),
					(holidays as FinancialAccountYieldHoliday[] | null)?.map(holiday => holiday.date) ?? [],
					rangeEnd,
					(yields as FinancialAccountYield[] | null) ?? [],
				);
				const accountEffects = recurrenceAccountEffects(
					recurrences,
					shiftRecurrenceDate(getLocalDateKey(), 1),
					rangeEnd.toISOString().slice(0, 10),
					new Set(
						transactions
							.filter(tx => tx.recurrenceId && tx.recurrenceOccurrenceDate)
							.map(tx => `${tx.recurrenceId}:${tx.recurrenceOccurrenceDate!.slice(0, 10)}`),
					),
				);
				for (const account of accountsAtRangeEnd)
					if (account.balance !== null)
						account.balance = (account.balance ?? 0) + (accountEffects.get(account.id) ?? 0);
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

				const forecasts = [
					...recurrences
						.filter(
							item => item.isActive && item.movement !== "TRANSFER" && !recurrenceNeedsConfiguration(item),
						)
						.flatMap(item => {
							const date = nextRecurrenceDate(item, shiftRecurrenceDate(getLocalDateKey(), 1));
							return date
								? [
										{
											amount: item.amount,
											date,
											direction: item.movement === "INCOME" ? ("INCOME" as const) : ("EXPENSE" as const),
											id: `recurrence-${item.id}`,
											name: item.name,
											sourceId: item.id,
											type: "RECURRING" as const,
										},
									]
								: [];
						}),
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
				const comparisonRangeEnd = new Date(
					comparisonStart.getFullYear(),
					comparisonStart.getMonth() + 11,
					0,
					23,
					59,
					59,
				);
				const comparisonEnd = new Date(Math.max(comparisonRangeEnd.getTime(), rangeEnd.getTime()));
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

				for (const recurrence of recurrences) {
					if (
						!recurrence.isActive ||
						recurrenceNeedsConfiguration(recurrence) ||
						recurrence.movement === "TRANSFER" ||
						recurrence.movement === "CARD_PURCHASE"
					)
						continue;
					for (const date of recurrenceDates(recurrence, dateKey(projectionStart), dateKey(comparisonEnd)))
						if (!linkedTransactionDates.has(`${recurrence.id}:${date}`))
							projectedMovements.push({
								amount: recurrence.amount,
								date: new Date(`${date}T12:00:00`),
								type: recurrence.movement === "INCOME" ? "INCOME" : "EXPENSE",
							});
				}
				const projectedStatements = (
					await Promise.all(
						cards.map(
							async card =>
								replayCreditBook(
									projectRecurrenceCreditBook(
										await readLocalCreditBook(card.id),
										recurrences,
										dateKey(projectionStart),
										dateKey(comparisonEnd),
									),
								).statements,
						),
					)
				).flat();
				for (const statement of projectedStatements) {
					const dueDate = new Date(`${statement.dueDate.slice(0, 10)}T12:00:00`);
					const outstanding = Math.max(0, statement.balanceAmount);
					if (outstanding && dueDate >= projectionStart && dueDate <= comparisonEnd)
						projectedMovements.push({ amount: outstanding, date: dueDate, type: "EXPENSE" });
				}
				const creditCards = cards.map(card => {
					const cardStatements = statements.filter(statement => statement.creditCardId === card.id);
					const statement =
						cardStatements
							.toSorted((left, right) => left.dueDate.localeCompare(right.dueDate))
							.find(item => item.dueDate >= dateKey(now)) ?? cardStatements.at(-1);
					const used = cardStatements.reduce((sum, item) => sum + toCents(item.balanceAmount), 0) / 100;
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
									balanceAmount: Math.max(0, statement.balanceAmount),
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
				const comparison = Array.from({ length: 12 }, (_, index) => {
					const start = new Date(comparisonStart.getFullYear(), comparisonStart.getMonth() + index - 1, 1);
					const end = new Date(start.getFullYear(), start.getMonth() + 1, 0, 23, 59, 59);
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
					accounts: accountsAtRangeEnd
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
					accountEmail: null,
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
		async getEventPage(personId: string, cursor?: null | string, limit = 50): Promise<DebtEventPage> {
			if (!isGuestMode()) {
				const params = new URLSearchParams({ limit: String(limit) });
				if (cursor) params.set("cursor", cursor);
				return fetchWithAuth<DebtEventPage>(`/debts/people/${personId}/events?${params}`);
			}
			const person = (await this.getLedger()).people.find(item => item.id === personId);
			const events = person?.events ?? [];
			const offset = cursor ? Number.parseInt(cursor, 10) : 0;
			const items = events.slice(offset, offset + limit);
			const nextOffset = offset + items.length;
			return {
				hasMore: nextOffset < events.length,
				items,
				nextCursor: nextOffset < events.length ? String(nextOffset) : null,
			};
		},
		async getInvitationPreview(id: string): Promise<DebtInvitationPreview> {
			if (isGuestMode()) throw new Error("Convite não encontrado.");
			return fetchWithAuth<DebtInvitationPreview>(`/debts/invitations/${encodeURIComponent(id)}/preview`);
		},
		async getInvitations(): Promise<DebtInvitation[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<DebtInvitation[]>("/debts/invitations");
		},
		async getLedger(): Promise<DebtLedger> {
			if (!isGuestMode()) {
				const owner = getCurrentCacheIdentity();
				if (!owner) throw new Error("Identidade local indisponível.");
				const summary = await fetchWithAuth<
					Omit<DebtLedger, "people"> & { people: Omit<DebtPerson, "events">[] }
				>("/debts");
				const ledger: DebtLedger = {
					...summary,
					people: summary.people.map(person => ({ ...person, events: [] })),
				};
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
				localCreditBooks.getAll(),
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
						accountEmail: null,
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
					time: null,
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
						time: transaction.time ?? null,
					});
				}
			}
			for (const item of storedPurchases) {
				const book = item.data;
				for (const purchase of book.purchases) {
					if (purchase.purchaseDate > getLocalDateKey() || !purchase.debtSplitRule) continue;
					const split = calculateDebtSplit(purchase.totalAmountCents / 100, purchase.debtSplitRule);
					if (!split) continue;
					const push = (
						id: string,
						date: string,
						description: string,
						amounts: number[],
						sign: number,
						time: string | null,
					) => {
						split.participants.forEach((participant, index) => {
							const person = people.get(participant.debtPersonId);
							const amount = amounts[index]! / 100;
							if (!person || !amount) return;
							const effect = sign * amount;
							person.balance += effect;
							person.events.push({
								amount,
								createdByMe: true,
								createdByName: "Você",
								createdByUserId: getUserId(),
								date,
								description,
								effect,
								id: `purchase:${id}:${participant.debtPersonId}`,
								kind: "PURCHASE",
								time,
							});
						});
					};
					const amounts = split.participants.map(p => moneyCents(p.amount));
					push(purchase.id, purchase.purchaseDate, purchase.description, amounts, 1, purchase.time);
					let refunded = 0;
					for (const refund of book.refunds
						.filter(r => r.purchaseId === purchase.id && !r.deletedAt && r.creditDate <= getLocalDateKey())
						.toSorted((a, b) => a.createdAt.localeCompare(b.createdAt) || a.id.localeCompare(b.id))) {
						push(
							refund.id,
							refund.creditDate,
							`Reembolso - ${purchase.description}`,
							refundDebtAmounts(purchase.totalAmountCents, amounts, refunded, refund.amountCents),
							-1,
							refund.time ?? null,
						);
						refunded += refund.amountCents;
					}
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
		async updatePerson(id: string, data: { accountEmail?: null | string; name: string }): Promise<void> {
			if (isGuestMode()) {
				const existing = await localDebtPeople.getById(id);
				if (!existing) throw new Error("Pessoa não encontrada.");
				await localDebtPeople.put({ ...existing.data, ...data }, id);
				return;
			}
			await fetchWithAuth(`/debts/people/${id}`, {
				body: JSON.stringify(data),
				method: "PATCH",
			});
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
		async advance(id: string, count: number, advanceType: "FRONT" | "BACK", paidDate: string) {
			if (!isGuestMode())
				return fetchWithAuth(`/loans/${id}/advance`, {
					body: JSON.stringify({ advanceType, installmentsToAdvance: count, paidDate }),
					method: "POST",
				});
			const loan = await localLoans.getById(id);
			if (!loan || loan.data.needsPaymentReview)
				throw new Error("Revise pagamentos antigos antes de antecipar");
			return advanceLocalLoanInstallments(id, count, advanceType, paidDate);
		},
		async create(data: Omit<Loan, "id" | "userId">): Promise<Loan> {
			const userId = getUserId();
			if (isGuestMode()) {
				const newLoan: Loan = {
					...data,
					id: crypto.randomUUID(),
					userId,
				};
				const payments = loanInstallments(newLoan).map(row => ({
					...row,
					id: crypto.randomUUID(),
					isAdvanced: false,
					loanId: newLoan.id,
				}));
				newLoan.installmentAmount = payments[0].totalPaid;
				await createLocalLoanWithPayments(newLoan, payments);
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
				const payments = (await localLoanPayments.getAll()).map(row => row.data);
				return local.map(({ data }) => {
					const rows = payments.filter(row => row.loanId === data.id);
					if (!rows.length || data.needsPaymentReview) return data;
					const paid = rows.filter(row => row.paidDate);
					return {
						...data,
						paidInstallments: paid.length,
						remainingInstallments: data.totalInstallments - paid.length,
						remainingPrincipal: rows
							.filter(row => !row.paidDate)
							.reduce((sum, row) => sum + row.principalPaid, 0),
						totalPaid: paid.reduce((sum, row) => sum + row.totalPaid, 0),
					};
				});
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
		async getEarlyPayoff(id: string) {
			if (!isGuestMode())
				return fetchWithAuth<import("./api").EarlyPayoff>(`/loans/${id}/early-payoff?advanceType=BACK`);
			const loan = await localLoans.getById(id);
			if (!loan || loan.data.needsPaymentReview)
				throw new Error("Revise histórico antes de calcular quitação");
			const rows = (await localLoanPayments.getAll()).filter(
				row => row.data.loanId === id && !row.data.paidDate,
			);
			const principal = rows.reduce((sum, row) => sum + row.data.principalPaid, 0);
			return {
				savedInterest: rows.reduce((sum, row) => sum + row.data.interestPaid, 0),
				totalToPay: principal,
			};
		},

		async getPaymentPage(
			id: string,
			options: { cursor?: string; limit?: number } = {},
		): Promise<LoanPaymentPage> {
			if (!isGuestMode()) {
				const params = new URLSearchParams();
				if (options.cursor) params.set("cursor", options.cursor);
				if (options.limit) params.set("limit", String(options.limit));
				return fetchWithAuth<LoanPaymentPage>(`/loans/${id}/payments?${params}`);
			}
			if (!(await localLoans.getById(id))) throw new Error("Empréstimo não encontrado");
			const rows = (await localLoanPayments.getAll())
				.map(row => row.data)
				.filter(row => row.loanId === id)
				.toSorted((a, b) => a.installmentNumber - b.installmentNumber || a.id.localeCompare(b.id));
			let position = 0;
			if (options.cursor) {
				const cursor = JSON.parse(atob(options.cursor));
				if (cursor.owner !== getUserId() || cursor.loanId !== id || !Number.isInteger(cursor.number))
					throw new Error("Cursor inválido");
				position = rows.findIndex(row => row.id === cursor.id && row.installmentNumber === cursor.number) + 1;
				if (!position) throw new Error("Cursor inválido");
			}
			const limit = options.limit ?? 50;
			if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite inválido");
			const items = rows.slice(position, position + limit);
			const hasMore = position + items.length < rows.length;
			const last = items.at(-1);
			return {
				hasMore,
				items,
				nextCursor:
					hasMore && last
						? btoa(
								JSON.stringify({
									id: last.id,
									loanId: id,
									number: last.installmentNumber,
									owner: getUserId(),
								}),
							)
						: null,
			};
		},

		async pay(
			id: string,
			number: number,
			paidDate: string,
			financialAccountId?: string,
		): Promise<LoanPayment> {
			if (!isGuestMode())
				return fetchWithAuth(`/loans/${id}/payments/${number}/pay`, {
					body: JSON.stringify({ financialAccountId, paidDate }),
					method: "POST",
				});
			const loan = await localLoans.getById(id);
			if (!loan || loan.data.needsPaymentReview) throw new Error("Revise pagamentos antigos antes de pagar");
			if (financialAccountId && !(await localAccounts.getById(financialAccountId)))
				throw new Error("Conta não encontrada");
			if (!/^\d{4}-\d{2}-\d{2}$/.test(paidDate) || Number.isNaN(Date.parse(paidDate)))
				throw new Error("Data inválida");
			return payLocalLoanInstallment(id, number, paidDate, financialAccountId);
		},
		async reviewLegacyPayments(id: string, paidDate: string, amortization: Loan["amortization"]) {
			if (!isGuestMode()) throw new Error("Revisão indisponível");
			await reviewLocalLoanPayments(id, paidDate, amortization);
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
	recurrences: recurrenceService,

	recurringPayments: createLegacyRecurrenceService("recurring", () => recurrenceService),

	salaries: createLegacyRecurrenceService("salary", () => recurrenceService),

	stores: {
		async create(name: string): Promise<Store> {
			if (isGuestMode()) {
				const normalizedName = name.normalize("NFKC").trim().replace(/\s+/gu, " ");
				if (!normalizedName) throw new Error("Informe o nome da loja");
				const existing = (await localStores.getAll()).find(
					row =>
						row.data.name.normalize("NFKC").trim().replace(/\s+/gu, " ").toLocaleLowerCase("pt-BR") ===
						normalizedName.toLocaleLowerCase("pt-BR"),
				);
				if (existing) return existing.data;
				name = normalizedName;
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

		async getPage(options: CatalogPageOptions = {}): Promise<StorePage> {
			if (isGuestMode())
				return localCatalogPage(
					(await localStores.getAll()).map(row => row.data),
					getUserId(),
					"stores",
					options,
				);
			const search = new URLSearchParams();
			if (options.cursor) search.set("cursor", options.cursor);
			if (options.search) search.set("search", options.search);
			if (options.limit !== undefined) search.set("limit", String(options.limit));
			return fetchWithAuth<StorePage>(`/stores?${search}`);
		},
	},

	// ============== SUBSCRIPTIONS ==============
	subscriptions: createLegacyRecurrenceService("subscription", () => recurrenceService),

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
					creditBooks,
					recurringPayments,
					transactions,
					loans,
					loanPayments,
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
					localCreditBooks.getAll(owner),
					localRecurringPayments.getAll(owner),
					localTransactions.getAll(owner),
					localLoans.getAll(owner),
					localLoanPayments.getAll(owner),
					localDebts.getAll(owner),
					localDebtPeople.getAll(owner),
					localSalaries.getAll(owner),
					localSubscriptions.getAll(owner),
					localMeta.get("financial-account-yield-holidays", owner),
					localMeta.get("financial-account-yields", owner),
				]);
				if (transactions.some(item => hasUnresolvedLegacyCardPayment(item.data)))
					throw new Error(
						"Pagamento antigo sem cartão identificado. Restaure a fatura de origem antes de sincronizar.",
					);

				if (loans.some(row => row.data.needsPaymentReview))
					throw new Error("Revise pagamentos antigos de empréstimos antes de sincronizar.");
				const recurrences = await localRecurrences.getAll(owner);
				const recurrenceOccurrences = await localRecurrenceOccurrences.getAll(owner);
				const recurrenceIds = new Set(recurrences.map(row => row.data.id));
				if (
					transactions.some(
						row =>
							row.data.salaryId ||
							row.data.subscriptionId ||
							(row.data.recurrenceId && !recurrenceIds.has(row.data.recurrenceId)),
					) ||
					creditBooks.some(row =>
						row.data.purchases.some(
							purchase => purchase.subscriptionId && !recurrenceIds.has(purchase.subscriptionId),
						),
					)
				)
					throw new Error("Referência de recorrência não resolvida. Corrija vínculo antes de sincronizar.");
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
						creditBooks: CreditBook[];
						recurringPayments: RecurringPayment[];
						recurrences: Recurrence[];
						recurrenceOccurrences: import("./recurrence").RecurrenceOccurrence[];
						transactions: Transaction[];
						loans: Loan[];
						loanPayments: LoanPayment[];
						debts: Debt[];
						debtPeople: DebtPerson[];
						salaries: Salary[];
						subscriptions: Subscription[];
					};
				}>("/sync", {
					body: JSON.stringify({
						categories: categories.map(c => c.data),
						creditBooks: creditBooks.map(purchase => purchase.data),
						creditCardStatements: creditCardStatements.map(statement => statement.data),
						creditCards: creditCards.map(card => card.data),
						debtPeople: debtPeople.map(person => person.data),
						debts: debts.map(d => d.data),
						financialAccounts: accounts.map(a => a.data),
						financialAccountYieldHolidays: (yieldHolidays as FinancialAccountYieldHoliday[] | null) ?? [],
						financialAccountYields: ((yields as FinancialAccountYield[] | null) ?? []).filter(
							yieldEntry => yieldEntry.origin !== "SYSTEM",
						),
						loanPayments: loanPayments.map(row => row.data),
						loans: loans.map(l => l.data),
						recurrenceOccurrences: recurrenceOccurrences.map(row => row.data),
						recurrences: recurrences.map(row => ({
							...row.data,
							debtSplit: row.data.debtSplit ? debtSplitToInput(row.data.debtSplit) : null,
						})),
						transactions: transactions.map(t => t.data),
					}),
					method: "POST",
				});

				await acknowledgeRecurrenceSync(
					recurrences,
					response.serverData.recurrences,
					recurrenceOccurrences,
					response.serverData.recurrenceOccurrences,
					owner,
				);
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
					response.syncResults.creditBooks?.errors.length
						? Promise.resolve()
						: acknowledgeCreditBookSync(creditBooks, response.serverData.creditBooks, owner),
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
					localLoanPayments.replaceSnapshot(
						response.serverData.loanPayments.map(data => ({ data, localId: data.id, syncedAt: Date.now() })),
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
		async approve(id: string): Promise<{ created: number; finished: boolean }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number; finished: boolean }>(`/transaction-imports/${id}/approve`, {
				method: "POST",
			});
		},
		async approveDay(importId: string, date: string): Promise<{ created: number; finished: boolean }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number; finished: boolean }>(
				`/transaction-imports/${importId}/days/${date}/approve`,
				{
					method: "POST",
				},
			);
		},
		async approveItem(importId: string, itemId: string): Promise<{ created: number; finished: boolean }> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			return fetchWithAuth<{ created: number; finished: boolean }>(
				`/transaction-imports/${importId}/items/${itemId}/approve`,
				{
					method: "POST",
				},
			);
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
		async get(id: string, cursor?: string): Promise<TransactionImport> {
			if (isGuestMode()) throw new Error("Conecte sua conta para importar extratos.");
			const suffix = cursor ? `?cursor=${encodeURIComponent(cursor)}` : "";
			return fetchWithAuth<TransactionImport>(`/transaction-imports/${id}${suffix}`);
		},
		async getPending(): Promise<TransactionImportSummary[]> {
			if (isGuestMode()) return [];
			return fetchWithAuth<TransactionImportSummary[]>("/transaction-imports");
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
						| "isDuplicateIgnored"
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
					data.recurrenceId ? localRecurrences.getById(data.recurrenceId) : undefined,
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
					: (linkedRecurrence?.tagIds ?? []);
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
				await localTransactions.delete(id);
				return;
			}
			await fetchWithAuth(`/transactions/${id}`, { method: "DELETE" });
			await localTransactions.delete(id);
		},
		async getAll(params?: {
			categoryId?: string;
			endDate?: string;
			financialAccountId?: string;
			limit?: number;
			offset?: number;
			search?: string;
			source?: NonNullable<Transaction["source"]>;
			startDate?: string;
			type?: Transaction["type"];
			visibility?: "hidden" | "visible";
		}): Promise<Transaction[]> {
			if (isGuestMode()) {
				const [local, storedPurchases, storedStatements, storedCards, storedCategories, storedAccounts] =
					await Promise.all([
						localTransactions.getAll(),
						localCreditBooks.getAll(),
						localCreditCardStatements.getAll(),
						localCreditCards.getAll(),
						localCategories.getAll(),
						localAccounts.getAll(),
					]);
				const statements = new Map(storedStatements.map(item => [item.data.id, item.data]));
				const cards = new Map(storedCards.map(item => [item.data.id, item.data]));
				const categories = new Map(storedCategories.map(item => [item.data.id, item.data]));
				const accounts = new Map(storedAccounts.map(item => [item.data.id, item.data]));
				const flattened = storedPurchases.flatMap(item =>
					creditBookConsumption(item.data).map(toPurchasePresentation),
				);
				const refundedPurchaseIds = new Set(
					flattened.flatMap(p => (p.refundOfPurchaseId ? [p.refundOfPurchaseId] : [])),
				);
				const purchases: Transaction[] = flattened
					.filter(
						p =>
							p.currentInstallment === 1 &&
							(!params?.type || params.type === (p.isRefund ? "REFUND" : "EXPENSE")),
					)
					.flatMap(p => {
						const statement = statements.get(p.statementId);
						const card = cards.get(p.creditCardId ?? statement?.creditCardId ?? "");
						if (!card) return [];
						const tags = (p.tagIds ?? []).flatMap(id => {
							const tag = categories.get(id);
							return tag ? [tag] : [];
						});
						return [
							{
								...p,
								amount: Math.abs(p.totalAmount),
								createdAt: p.purchaseDate,
								date: p.purchaseDate,
								debtSplit: null,
								hasRefund: !p.isRefund && refundedPurchaseIds.has(p.id),
								originFinancialAccountId: card.financialAccountId,
								originName: card.accountName ?? "Cartão de crédito",
								source: "CREDIT_CARD" as const,
								sourceName: card.accountName ?? "Cartão de crédito",
								tags,
								type: (p.isRefund ? "REFUND" : "EXPENSE") as "REFUND" | "EXPENSE",
							} as Transaction,
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
						const paymentCard = item.data.paymentCreditCardId
							? cards.get(item.data.paymentCreditCardId)
							: undefined;
						const paymentCycle = paymentCard
							? paymentStatement(
									[...statements.values()].filter(statement => statement.creditCardId === paymentCard.id),
									item.data.date,
								)
							: undefined;

						return {
							...item.data,
							creditCardName: paymentCard?.accountName,
							creditCardStatementDate: paymentCycle?.statementDate,
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
				if (params?.source) transactions = transactions.filter(t => t.source === params.source);
				if (params?.visibility === "hidden") transactions = transactions.filter(t => t.isHidden);
				if (params?.visibility === "visible") transactions = transactions.filter(t => !t.isHidden);
				if (params?.search) {
					const search = normalizeTransactionSearch(params.search);
					transactions = transactions.filter(transaction =>
						getTransactionSearchText(transaction).includes(search),
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

			throw new Error("Leitura integral disponível somente no modo convidado; use getDailyPage");
		},
		async getDailyPage(params: {
			categoryId?: string;
			cursor?: string;
			endDate?: string;
			financialAccountId?: string;
			limit?: number;
			search?: string;
			source?: NonNullable<Transaction["source"]>;
			startDate?: string;
			type?: Transaction["type"];
			visibility?: "hidden" | "visible";
		}): Promise<{
			days: Array<{ date: string; endingBalance: number; transactions: Transaction[] }>;
			hasMore: boolean;
			nextCursor: null | string;
		}> {
			if (isGuestMode()) {
				let offset = 0;
				if (params.cursor)
					try {
						offset = Number(JSON.parse(atob(params.cursor)).offset ?? 0);
					} catch {
						throw new Error("Cursor inválido para estes filtros");
					}
				const { cursor: _cursor, ...filters } = params;
				const transactions = await this.getAll({ ...filters, offset });
				const dates = [...new Set(transactions.map(transaction => transaction.date.slice(0, 10)))];
				const hasMore = Boolean(params.limit && transactions.length === params.limit);
				return {
					days: dates.map(date => ({
						date,
						endingBalance: 0,
						transactions: transactions.filter(transaction => transaction.date.slice(0, 10) === date),
					})),
					hasMore,
					nextCursor: hasMore ? btoa(JSON.stringify({ offset: offset + transactions.length })) : null,
				};
			}
			const searchParams = new URLSearchParams();
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
			data: Omit<Partial<Transaction>, "paymentCreditCardId" | "debtSplit" | "storeName"> & {
				paymentCreditCardId?: string | null;
				debtSplit?: DebtSplitInput | null;
				storeName?: string | null;
			},
		): Promise<Transaction> {
			if (isGuestMode()) {
				const { paymentCreditCardId, debtSplit: debtSplitInput, ...transactionChanges } = data;
				const existing = await localTransactions.getById(id);
				if (!existing) throw new Error("Transação não encontrada");

				const updated: Transaction = {
					...existing.data,
					...transactionChanges,
					...(paymentCreditCardId !== undefined && {
						paymentCreditCardId: paymentCreditCardId ?? undefined,
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
