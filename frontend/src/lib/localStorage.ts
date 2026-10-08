import {
	type CreditBook,
	creditBookEntries,
	creditBookRewards,
	materializeBookInstallments,
	moneyCents,
	moveBookPurchase,
	replayCreditBook,
} from "@zaimu/finance/credit-book";
import { currentDateKey } from "@zaimu/finance/credit-card";
import { currencyScale } from "@zaimu/finance/money";
import { pendingStatementPayments } from "@zaimu/finance/payment-suggestions";
import type {
	Category,
	CreditCard,
	CreditCardStatement,
	CreditPurchase,
	DebtPerson,
	FinancialAccount,
	Loan,
	LoanPayment,
	Store,
	StoredDebtEvent,
	Transaction,
} from "@/lib/api";
import { type CacheIdentity, getCurrentCacheIdentity } from "@/lib/query-cache";
import { calculateDebtSplit } from "./debt-split";
import { calculateFinancialAccountBalances } from "./financial-account";
import { requestResult, transactionDone } from "./idb";
import type { Recurrence, RecurrenceOccurrence } from "./recurrence";

const DB_NAME = "zaimu-local";
const DB_VERSION = 15;

const LOCAL_STORES = {
	accounts: "accounts",
	categories: "categories",
	creditBooks: "creditBooks",
	creditCardStatements: "creditCardStatements",
	creditCards: "creditCards",
	creditRefundReviews: "creditRefundReviews",
	debtEvents: "debtEvents",
	debtPeople: "debtPeople",
	loanPayments: "loanPayments",
	loans: "loans",
	meta: "meta",
	recurrenceOccurrences: "recurrenceOccurrences",
	recurrences: "recurrences",
	stores: "stores",
	transactions: "transactions",
} as const;

type StoreDomain = keyof typeof LOCAL_STORES;
type ScopedStoreName = `scoped-${(typeof LOCAL_STORES)[StoreDomain]}`;
export type StorageOwner = CacheIdentity;

const scopedStoreName = (domain: StoreDomain): ScopedStoreName => `scoped-${LOCAL_STORES[domain]}`;

export interface LocalData<T> {
	data: T;
	deleted?: boolean;
	localId: string;
	modifiedAt: number;
	ownerKey: StorageOwner;
	scopedId: string;
	syncedAt?: number;
}

let db: IDBDatabase | null = null;
let dbInitializationPromise: Promise<IDBDatabase> | null = null;
let migrationPromise: Promise<void> | null = null;

const scopedId = (ownerKey: StorageOwner, localId: string) => `${ownerKey}\u0000${localId}`;

function requireOwner(ownerKey?: StorageOwner): StorageOwner {
	const capturedOwner = ownerKey ?? getCurrentCacheIdentity();
	if (!capturedOwner) throw new Error("Identidade local indisponível.");
	return capturedOwner;
}

async function runTransaction<T>(
	storeName: ScopedStoreName,
	mode: IDBTransactionMode,
	operation: (store: IDBObjectStore) => Promise<T>,
	databaseOverride?: IDBDatabase,
): Promise<T> {
	const database = databaseOverride ?? (await initLocalDb());
	const transaction = database.transaction(storeName, mode);
	const completion = transactionDone(transaction);
	try {
		const result = await operation(transaction.objectStore(storeName));
		await completion;
		return result;
	} catch (error) {
		try {
			transaction.abort();
		} catch {
			// Transaction may already be complete or aborted.
		}
		await completion.catch(() => undefined);
		throw error;
	}
}

function explicitOwner(data: unknown): StorageOwner | null {
	if (!data || typeof data !== "object") return null;
	const value = data as Record<string, unknown>;
	if (typeof value.userId === "string" && value.userId)
		return value.userId.startsWith("guest_") ? `guest:${value.userId}` : `user:${value.userId}`;
	if (typeof value.ownerId === "string" && value.ownerId) return `user:${value.ownerId}`;
	if (typeof value.guestId === "string" && value.guestId) return `guest:${value.guestId}`;
	return null;
}

async function openLocalDb(): Promise<IDBDatabase> {
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		let request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => {
			if (request.error?.name === "VersionError") {
				request = indexedDB.open(DB_NAME, DB_VERSION + 1);
				request.onerror = () => reject(request.error);
				request.onsuccess = () => resolve(request.result);
			} else reject(request.error);
		};
		request.onblocked = () => reject(new Error("Banco local bloqueado por outra aba."));
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = event => {
			if (!request.result.objectStoreNames.contains("application-upgrade"))
				request.result.createObjectStore("application-upgrade", { keyPath: "id" });
			// Index-only upgrades must not replay already completed financial migrations.
			if (event.oldVersion < 13)
				request
					.transaction!.objectStore("application-upgrade")
					.put({ id: "state", status: event.oldVersion === 0 ? "complete" : "pending", version: 13 });
			if (event.oldVersion > 0)
				for (const domain of ["recurringPayments", "salaries", "subscriptions", "creditPurchases", "debts"]) {
					const name = `scoped-${domain}`;
					if (!request.result.objectStoreNames.contains(name))
						request.result
							.createObjectStore(name, { keyPath: "scopedId" })
							.createIndex("ownerKey", "ownerKey");
				}
			for (const domain of Object.keys(LOCAL_STORES) as StoreDomain[]) {
				const name = scopedStoreName(domain);
				const store = request.result.objectStoreNames.contains(name)
					? request.transaction!.objectStore(name)
					: request.result.createObjectStore(name, { keyPath: "scopedId" });
				for (const index of ["ownerKey", "syncedAt", "modifiedAt", "deleted"])
					if (!store.indexNames.contains(index)) store.createIndex(index, index, { unique: false });
				if (!store.indexNames.contains("ownerModifiedAt"))
					store.createIndex("ownerModifiedAt", ["ownerKey", "modifiedAt"]);
				if (domain === "transactions" && !store.indexNames.contains("ownerDate"))
					store.createIndex("ownerDate", ["ownerKey", "data.date", "localId"]);
			}
		};
	});
	database.onversionchange = () => {
		database.close();
		db = null;
		dbInitializationPromise = null;
		migrationPromise = null;
	};
	const tx = database.transaction("application-upgrade", "readonly");
	const state = await requestResult(tx.objectStore("application-upgrade").get("state"));
	migrationPromise =
		state?.status === "complete"
			? Promise.resolve()
			: import("./upgrades/local-upgrade").then(({ upgradeLocalDatabase }) => upgradeLocalDatabase(database));
	try {
		await migrationPromise;
	} catch (error) {
		database.close();
		throw error;
	}
	const retired = Array.from(database.objectStoreNames).filter(
		name =>
			name !== "application-upgrade" &&
			!Object.values(LOCAL_STORES).some(domain => name === `scoped-${domain}`),
	);
	if (retired.length && database.version < 14) {
		database.close();
		const cleanup = indexedDB.open(DB_NAME, DB_VERSION + 1);
		cleanup.onupgradeneeded = () => {
			const tx = cleanup.transaction!;
			const state = tx.objectStore("application-upgrade").get("state");
			state.onsuccess = () => {
				if (state.result?.status !== "complete" || state.result.version !== 13) {
					tx.abort();
					return;
				}
				for (const name of retired) {
					const count = tx.objectStore(name).count();
					count.onsuccess = () => {
						if (count.result !== 0) tx.abort();
						else cleanup.result.deleteObjectStore(name);
					};
				}
			};
		};
		cleanup.onblocked = () => {
			/* Other tabs close through onversionchange. */
		};
		const cleaned = await requestResult(cleanup);
		cleaned.onversionchange = () => {
			cleaned.close();
			db = null;
			dbInitializationPromise = null;
			migrationPromise = null;
		};
		db = cleaned;
		return cleaned;
	}
	db = database;
	return database;
}

export async function initLocalDb(): Promise<IDBDatabase> {
	if (db) {
		await migrationPromise;
		return db;
	}
	dbInitializationPromise ??= openLocalDb();
	try {
		return await dbInitializationPromise;
	} catch (error) {
		dbInitializationPromise = null;
		db = null;
		migrationPromise = null;
		throw error;
	}
}

export async function getAll<T>(domain: StoreDomain, ownerKey?: StorageOwner): Promise<LocalData<T>[]> {
	const owner = requireOwner(ownerKey);
	return runTransaction(scopedStoreName(domain), "readonly", async store => {
		const results = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<T>[];
		return results.filter(item => !item.deleted);
	});
}

export async function getAllWithTombstones<T>(
	domain: StoreDomain,
	ownerKey?: StorageOwner,
): Promise<LocalData<T>[]> {
	const owner = requireOwner(ownerKey);
	return runTransaction(scopedStoreName(domain), "readonly", store =>
		requestResult(store.index("ownerKey").getAll(owner)),
	);
}

export async function getById<T>(
	domain: StoreDomain,
	localId: string,
	ownerKey?: StorageOwner,
): Promise<LocalData<T> | undefined> {
	const owner = requireOwner(ownerKey);
	return runTransaction(scopedStoreName(domain), "readonly", async store => {
		const result = (await requestResult(store.get(scopedId(owner, localId)))) as LocalData<T> | undefined;
		return result?.deleted ? undefined : result;
	});
}

export async function put<T>(
	domain: StoreDomain,
	data: T,
	localId?: string,
	ownerKey?: StorageOwner,
): Promise<string> {
	const owner = requireOwner(ownerKey ?? explicitOwner(data) ?? undefined);
	const id = localId ?? crypto.randomUUID();
	const timestamp = Date.now();
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const existing =
			domain === "debtEvents"
				? ((await requestResult(store.get(scopedId(owner, id)))) as LocalData<StoredDebtEvent> | undefined)
				: undefined;
		if (existing?.deleted) throw new Error("Lançamento excluído");
		const debtData = data as StoredDebtEvent;
		const nextData =
			domain === "debtEvents"
				? {
						...debtData,
						...(existing?.syncedAt
							? { baseUpdatedAt: existing.data.baseUpdatedAt ?? existing.data.updatedAt }
							: {}),
					}
				: data;
		await requestResult(
			store.put({
				data: nextData,
				localId: id,
				modifiedAt: Math.max(timestamp, (existing?.modifiedAt ?? 0) + 1),
				ownerKey: owner,
				scopedId: scopedId(owner, id),
				...(domain === "debtEvents"
					? { syncedAt: existing?.syncedAt }
					: owner.startsWith("user:") && { syncedAt: timestamp }),
			}),
		);
	});
	return id;
}

export async function softDelete(
	domain: StoreDomain,
	localId: string,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	if (domain === "transactions") {
		const database = await initLocalDb();
		const tx = database.transaction(["scoped-transactions", "scoped-recurrenceOccurrences"], "readwrite");
		const done = transactionDone(tx);
		const store = tx.objectStore("scoped-transactions");
		const item = (await requestResult(store.get(scopedId(owner, localId)))) as
			| LocalData<Transaction>
			| undefined;
		if (item) {
			const occurrenceId =
				item.data.recurrenceId && item.data.recurrenceOccurrenceDate
					? `${item.data.recurrenceId}:${item.data.recurrenceOccurrenceDate.slice(0, 10)}`
					: null;
			if (occurrenceId) {
				const occurrences = tx.objectStore("scoped-recurrenceOccurrences");
				const occurrence = (await requestResult(occurrences.get(scopedId(owner, occurrenceId)))) as
					| LocalData<RecurrenceOccurrence>
					| undefined;
				if (occurrence)
					await requestResult(
						occurrences.put({
							...occurrence,
							data: { ...occurrence.data, deletedAt: new Date().toISOString() },
							modifiedAt: Math.max(Date.now(), occurrence.modifiedAt + 1),
						}),
					);
			}
			if (owner.startsWith("user:")) await requestResult(store.delete(scopedId(owner, localId)));
			else
				await requestResult(
					store.put({ ...item, deleted: true, modifiedAt: Math.max(Date.now(), item.modifiedAt + 1) }),
				);
		}
		await done;
		return;
	}
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const key = scopedId(owner, localId);
		if (owner.startsWith("user:") && domain !== "debtEvents" && domain !== "debtPeople") {
			await requestResult(store.delete(key));
			return;
		}
		const item = (await requestResult(store.get(key))) as LocalData<unknown> | undefined;
		if (!item) return;
		await requestResult(
			store.put({ ...item, deleted: true, modifiedAt: Math.max(Date.now(), item.modifiedAt + 1) }),
		);
	});
}

export async function hardDelete(
	domain: StoreDomain,
	localId: string,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		await requestResult(store.delete(scopedId(owner, localId)));
	});
}

export async function getModifiedSince<T>(
	domain: StoreDomain,
	since: number,
	ownerKey?: StorageOwner,
): Promise<LocalData<T>[]> {
	const owner = requireOwner(ownerKey);
	return runTransaction(scopedStoreName(domain), "readonly", async store => {
		const records = (await requestResult(
			store
				.index("ownerModifiedAt")
				.getAll(IDBKeyRange.bound([owner, since], [owner, Number.MAX_SAFE_INTEGER], true)),
		)) as LocalData<T>[];
		return records.filter(item => !item.deleted);
	});
}

function isLocallyModified(item: LocalData<unknown>): boolean {
	return item.syncedAt === undefined || item.modifiedAt > item.syncedAt;
}

/** Enqueue a bounded batch without one JS completion callback per stored record. */
async function writeRemoteBatch<T>(
	store: IDBObjectStore,
	items: SnapshotItem<T>[],
	existing: Map<string, LocalData<T>>,
	owner: StorageOwner,
): Promise<void> {
	for (let offset = 0; offset < items.length; offset += 1000) {
		let last: IDBRequest<IDBValidKey> | undefined;
		for (const item of items.slice(offset, offset + 1000)) {
			const current = existing.get(item.localId);
			if (current && isLocallyModified(current)) continue;
			const timestamp = item.syncedAt ?? Date.now();
			if (
				current &&
				!current.deleted &&
				current.syncedAt === timestamp &&
				JSON.stringify(current.data) === JSON.stringify(item.data)
			)
				continue;
			last = store.put({
				data: item.data,
				localId: item.localId,
				modifiedAt: timestamp,
				ownerKey: owner,
				scopedId: scopedId(owner, item.localId),
				syncedAt: timestamp,
			});
		}
		if (last) await requestResult(last);
	}
}

export async function bulkPut<T>(
	domain: StoreDomain,
	items: SnapshotItem<T>[],
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const existing = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<T>[];
		await writeRemoteBatch(store, items, new Map(existing.map(row => [row.localId, row])), owner);
	});
}

async function reconcileRemote<T>(
	domain: StoreDomain,
	items: SnapshotItem<T>[],
	belongsToSlice: (data: T) => boolean,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	const remoteIds = new Set(items.map(item => item.localId));
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const existing = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<T>[];
		let lastDeletion: IDBRequest<undefined> | undefined;
		for (const item of existing)
			if (belongsToSlice(item.data) && !remoteIds.has(item.localId) && !isLocallyModified(item))
				lastDeletion = store.delete(item.scopedId);
		if (lastDeletion) await requestResult(lastDeletion);
		await writeRemoteBatch(store, items, new Map(existing.map(row => [row.localId, row])), owner);
	});
}

export async function replaceRemoteSnapshot<T>(
	domain: StoreDomain,
	items: SnapshotItem<T>[],
	ownerKey?: StorageOwner,
): Promise<void> {
	await reconcileRemote(domain, items, () => true, ownerKey);
}

export async function replaceRemoteSlice<T>(
	domain: StoreDomain,
	items: SnapshotItem<T>[],
	belongsToSlice: (data: T) => boolean,
	ownerKey?: StorageOwner,
): Promise<void> {
	await reconcileRemote(domain, items, belongsToSlice, ownerKey);
}

export async function clearStore(domain: StoreDomain, ownerKey?: StorageOwner): Promise<void> {
	const owner = requireOwner(ownerKey);
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const keys = await requestResult(store.index("ownerKey").getAllKeys(owner));
		let last: IDBRequest<undefined> | undefined;
		for (const key of keys) last = store.delete(key);
		if (last) await requestResult(last);
	});
}

export async function clearAllLocalData(ownerKey?: StorageOwner): Promise<void> {
	const owner = requireOwner(ownerKey);
	for (const domain of Object.keys(LOCAL_STORES) as StoreDomain[]) await clearStore(domain, owner);
}

interface SnapshotItem<T> {
	data: T;
	localId: string;
	syncedAt?: number;
}

function createLocalStore<T>(domain: StoreDomain) {
	return {
		bulkPut: (items: SnapshotItem<T>[], owner?: StorageOwner) => bulkPut(domain, items, owner),
		clear: (owner?: StorageOwner) => clearStore(domain, owner),
		delete: (id: string, owner?: StorageOwner) => softDelete(domain, id, owner),
		getAll: (owner?: StorageOwner) => getAll<T>(domain, owner),
		getAllWithTombstones: (owner?: StorageOwner) => getAllWithTombstones<T>(domain, owner),
		getById: (id: string, owner?: StorageOwner) => getById<T>(domain, id, owner),
		getModifiedSince: (since: number, owner?: StorageOwner) => getModifiedSince<T>(domain, since, owner),
		put: (data: T, id?: string, owner?: StorageOwner) => put(domain, data, id, owner),
		replaceSlice: (items: SnapshotItem<T>[], belongsToSlice: (data: T) => boolean, owner?: StorageOwner) =>
			replaceRemoteSlice(domain, items, belongsToSlice, owner),
		replaceSnapshot: (items: SnapshotItem<T>[], owner?: StorageOwner) =>
			replaceRemoteSnapshot(domain, items, owner),
	};
}

export const localAccounts = createLocalStore<FinancialAccount>("accounts");
export const localCategories = createLocalStore<Category>("categories");
export const localStores = createLocalStore<Store>("stores");
export const localTransactions = createLocalStore<Transaction>("transactions");
export const localLoanPayments = createLocalStore<LoanPayment>("loanPayments");
export const localLoans = createLocalStore<Loan>("loans");
export const localDebtEvents = createLocalStore<StoredDebtEvent>("debtEvents");
export const localDebtPeople = createLocalStore<DebtPerson>("debtPeople");
export const localRecurrences = createLocalStore<Recurrence>("recurrences");
export const localRecurrenceOccurrences = createLocalStore<RecurrenceOccurrence>("recurrenceOccurrences");
export const localCreditCards = createLocalStore<CreditCard>("creditCards");
export const localCreditCardStatements = createLocalStore<CreditCardStatement>("creditCardStatements");
export const localCreditBooks = createLocalStore<CreditBook>("creditBooks");
export async function acknowledgeCreditBookSync(
	sent: LocalData<CreditBook>[],
	received: CreditBook[],
	owner: StorageOwner,
) {
	await runTransaction("scoped-creditBooks", "readwrite", async store => {
		for (const book of received) {
			const id = scopedId(owner, book.card.id);
			const current = (await requestResult(store.get(id))) as LocalData<CreditBook> | undefined;
			const source = sent.find(row => row.localId === book.card.id);
			if (current && (!source || current.modifiedAt !== source.modifiedAt)) continue;
			const now = Date.now();
			await requestResult(
				store.put({
					data: book,
					localId: book.card.id,
					modifiedAt: now,
					ownerKey: owner,
					scopedId: id,
					syncedAt: now,
				}),
			);
		}
	});
}
export const localCreditRefundReviews = createLocalStore<{
	original: CreditPurchase;
	creditCardId: string;
	requiresRefundReview: boolean;
}>("creditRefundReviews");
/** Presentation-only entries; the flattened store is never written after migration. */
export const localCreditPurchases = {
	delete: async (id: string, owner?: StorageOwner) => {
		const row = await localCreditPurchases.getById(id, owner);
		if (!row) throw new Error("Compra não encontrada");
		await mutateLocalCreditBook(
			row.data.creditCardId!,
			book => {
				const purchaseId = row.data.purchaseId ?? row.data.parentId ?? row.data.id;
				book.deletedPurchaseIds = [...new Set([...(book.deletedPurchaseIds ?? []), purchaseId])];
				book.purchases = book.purchases.filter(p => p.id !== purchaseId);
				book.installments = book.installments.filter(i => i.purchaseId !== purchaseId);
				book.refunds = book.refunds.filter(r => r.purchaseId !== purchaseId);
			},
			owner,
		);
	},
	getAll: async (owner?: StorageOwner): Promise<LocalData<CreditPurchase>[]> =>
		(await localCreditBooks.getAll(owner)).flatMap(row =>
			creditBookEntries(row.data).map(entry => ({
				...row,
				data: toPurchasePresentation(entry),
				localId: entry.id,
				scopedId: scopedId(row.ownerKey, entry.id),
			})),
		),
	getById: async (id: string, owner?: StorageOwner) =>
		(await localCreditPurchases.getAll(owner)).find(row => row.localId === id),
};
export function toPurchasePresentation(entry: ReturnType<typeof creditBookEntries>[number]): CreditPurchase {
	return {
		...entry,
		cashbackAccountId: ("cashbackAccountId" in entry ? entry.cashbackAccountId : null) ?? undefined,
		cashbackAmount: ("cashbackAmount" in entry ? entry.cashbackAmount : null) ?? undefined,
		cashbackYieldPeriod: ("cashbackYieldPeriod" in entry ? entry.cashbackYieldPeriod : null) ?? undefined,
		cashbackYieldReferencePercentage:
			("cashbackYieldReferencePercentage" in entry ? entry.cashbackYieldReferencePercentage : null) ??
			undefined,
		cashbackYieldReferenceRate:
			("cashbackYieldReferenceRate" in entry ? entry.cashbackYieldReferenceRate : null) ?? undefined,
		creditCardId: "creditCardId" in entry ? entry.creditCardId : undefined,
		feeAmount: ("feeAmount" in entry ? entry.feeAmount : null) ?? undefined,
		feeDescription: ("feeDescription" in entry ? entry.feeDescription : null) ?? undefined,
		parentId: entry.parentId ?? undefined,
		purchaseId: entry.purchaseId ?? undefined,
		recurrenceId: ("recurrenceId" in entry ? entry.recurrenceId : null) ?? undefined,
		recurrenceOccurrenceDate:
			("recurrenceOccurrenceDate" in entry ? entry.recurrenceOccurrenceDate : null) ?? undefined,
		refinancingFeeAmount: ("refinancingFeeAmount" in entry ? entry.refinancingFeeAmount : null) ?? undefined,
		refundOfPurchaseId: entry.refundOfPurchaseId ?? undefined,
		storeName: entry.storeName ?? undefined,
		tagIds: [...entry.tagIds],
		time: entry.time ?? null,
	};
}

/** Card mutations, institution policy and invoice balances commit on one IDB transaction. */
export async function mutateLocalCreditBook<T>(
	cardId: string,
	operation: (book: CreditBook) => T,
	ownerKey?: StorageOwner,
	reviewIdToDelete?: string,
	asOf = currentDateKey(),
): Promise<T> {
	const owner = requireOwner(ownerKey);
	const database = await initLocalDb();
	const tx = database.transaction(
		[
			"scoped-creditBooks",
			"scoped-creditCards",
			"scoped-accounts",
			"scoped-transactions",
			"scoped-creditCardStatements",
			"scoped-creditRefundReviews",
			"scoped-meta",
			"scoped-debtPeople",
			"scoped-categories",
			"scoped-recurrences",
			"scoped-recurrenceOccurrences",
		],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const stored = (await requestResult(tx.objectStore("scoped-creditBooks").get(scopedId(owner, cardId)))) as
			| LocalData<CreditBook>
			| undefined;
		const cardRow = (await requestResult(
			tx.objectStore("scoped-creditCards").get(scopedId(owner, cardId)),
		)) as LocalData<CreditCard> | undefined;
		if (!cardRow || cardRow.deleted) throw new Error("Cartão não encontrado");
		const card = cardRow.data;
		const accountRow = (await requestResult(
			tx.objectStore("scoped-accounts").get(scopedId(owner, card.financialAccountId)),
		)) as LocalData<FinancialAccount> | undefined;
		const institutionId = accountRow?.data.institutionId ?? null;
		const policyKey = scopedId(owner, `refund-policy-${institutionId}`);
		const policy = institutionId ? await requestResult(tx.objectStore("scoped-meta").get(policyKey)) : null;
		const book: CreditBook = stored?.data ?? {
			card: {
				currency: card.currency ?? accountRow?.data.currency ?? "BRL",
				dueDay: card.dueDay,
				id: cardId,
				ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
				institutionId,
				refundPolicy: null,
				statementDay: card.statementDay,
				userId: owner.split(":").slice(1).join(":"),
				workingDueDate: card.workingDueDate,
			},
			charges: [],
			installments: [],
			payments: [],
			purchases: [],
			refunds: [],
			statements: [],
		};
		Object.assign(book.card, {
			dueDay: card.dueDay,
			ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
			institutionId,
			refundPolicy: policy?.data ?? book.card.refundPolicy,
			statementDay: card.statementDay,
			workingDueDate: card.workingDueDate,
		});
		const transactions = (await requestResult(
			tx.objectStore("scoped-transactions").index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[];
		book.payments = transactions
			.filter(row => !row.deleted && row.data.paymentCreditCardId === cardId)
			.map(row => ({
				amount: row.data.paymentAmount ?? row.data.amount,
				date: row.data.date.slice(0, 10),
				id: row.data.id,
			}));
		const oldPolicy = book.card.refundPolicy;
		const result = operation(book);
		for (const p of book.purchases) {
			if (p.userId !== book.card.userId || p.creditCardId !== cardId)
				throw new Error("Titularidade da compra inválida");
			for (const id of new Set(p.tagIds))
				if (!(await requestResult(tx.objectStore("scoped-categories").get(scopedId(owner, id)))))
					throw new Error("Tag indisponível");
			for (const [store, id] of [
				["scoped-accounts", p.cashbackAccountId],
				["scoped-recurrences", p.recurrenceId],
			] as const)
				if (id && !(await requestResult(tx.objectStore(store).get(scopedId(owner, id)))))
					throw new Error("Vínculo indisponível");
			if (p.debtSplitRule) {
				if (
					!calculateDebtSplit(
						p.totalAmountCents / currencyScale(book.card.currency),
						p.debtSplitRule,
						book.card.currency,
					)
				)
					throw new Error("Rateio inválido");
				for (const participant of p.debtSplitRule.participants)
					if (
						!(await requestResult(
							tx.objectStore("scoped-debtPeople").get(scopedId(owner, participant.debtPersonId)),
						))
					)
						throw new Error("Pessoa da dívida indisponível");
			}
		}
		materializeBookInstallments(book, asOf);
		if (institutionId && oldPolicy !== book.card.refundPolicy)
			await requestResult(
				tx.objectStore("scoped-meta").put({
					data: book.card.refundPolicy,
					localId: `refund-policy-${institutionId}`,
					modifiedAt: Date.now(),
					ownerKey: owner,
					scopedId: policyKey,
				}),
			);
		for (const removed of stored?.data.purchases ?? [])
			if (
				removed.recurrenceId &&
				removed.recurrenceOccurrenceDate &&
				!book.purchases.some(p => p.id === removed.id)
			) {
				const occurrences = tx.objectStore("scoped-recurrenceOccurrences");
				const identity = `${removed.recurrenceId}:${removed.recurrenceOccurrenceDate}`;
				const row = (await requestResult(occurrences.get(scopedId(owner, identity)))) as
					| LocalData<RecurrenceOccurrence>
					| undefined;
				if (row)
					await requestResult(
						occurrences.put({
							...row,
							data: { ...row.data, deletedAt: new Date().toISOString() },
							modifiedAt: Math.max(Date.now(), row.modifiedAt + 1),
						}),
					);
			}
		const now = Math.max(Date.now(), (stored?.modifiedAt ?? 0) + 1);
		await requestResult(
			tx.objectStore("scoped-creditBooks").put({
				...stored,
				data: book,
				localId: cardId,
				modifiedAt: now,
				ownerKey: owner,
				scopedId: scopedId(owner, cardId),
			}),
		);
		if (reviewIdToDelete)
			await requestResult(
				tx.objectStore("scoped-creditRefundReviews").delete(scopedId(owner, reviewIdToDelete)),
			);
		for (const s of replayCreditBook(book).statements.filter(s =>
			book.statements.some(old => old.id === s.id),
		))
			await requestResult(
				tx.objectStore("scoped-creditCardStatements").put({
					data: { ...s, totalAmount: Number(s.totalAmount) + s.chargesAmount },
					localId: s.id,
					modifiedAt: now,
					ownerKey: owner,
					scopedId: scopedId(owner, s.id),
				}),
			);
		await done;
		return result;
	} catch (error) {
		try {
			tx.abort();
		} catch {}
		await done.catch(() => undefined);
		throw error;
	}
}

export async function transferLocalCreditBookPurchase(
	sourceCardId: string,
	destinationCardId: string,
	purchaseId: string,
	update: (book: CreditBook, card: CreditCard) => void,
) {
	const owner = requireOwner();
	const [source, destination] = await Promise.all([
		readLocalCreditBook(sourceCardId, owner),
		readLocalCreditBook(destinationCardId, owner),
	]);
	const database = await initLocalDb();
	const tx = database.transaction(
		["scoped-creditBooks", "scoped-creditCards", "scoped-creditCardStatements", "scoped-transactions"],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const store = tx.objectStore("scoped-creditBooks");
		const [sourceRow, destinationRow, cardRow] = await Promise.all([
			requestResult(store.get(scopedId(owner, sourceCardId))) as Promise<LocalData<CreditBook> | undefined>,
			requestResult(store.get(scopedId(owner, destinationCardId))) as Promise<
				LocalData<CreditBook> | undefined
			>,
			requestResult(tx.objectStore("scoped-creditCards").get(scopedId(owner, destinationCardId))) as Promise<
				LocalData<CreditCard> | undefined
			>,
		]);
		if (!cardRow || cardRow.deleted) throw new Error("Cartão de destino não encontrado");
		// Refresh ledger contents inside the write transaction so concurrent edits survive.
		if (sourceRow && !sourceRow.deleted)
			Object.assign(source, { ...structuredClone(sourceRow.data), card: source.card });
		if (destinationRow && !destinationRow.deleted)
			Object.assign(destination, { ...structuredClone(destinationRow.data), card: destination.card });
		const transactions = (await requestResult(
			tx.objectStore("scoped-transactions").index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[];
		for (const book of [source, destination])
			book.payments = transactions
				.filter(row => !row.deleted && row.data.paymentCreditCardId === book.card.id)
				.map(row => ({
					amount: row.data.paymentAmount ?? row.data.amount,
					date: row.data.date.slice(0, 10),
					id: row.data.id,
				}));
		moveBookPurchase(source, destination, purchaseId);
		update(destination, cardRow.data);
		materializeBookInstallments(source);
		materializeBookInstallments(destination);
		const now = Date.now();
		for (const [id, book, previous] of [
			[sourceCardId, source, sourceRow],
			[destinationCardId, destination, destinationRow],
		] as const) {
			await requestResult(
				store.put({
					...previous,
					data: book,
					localId: id,
					modifiedAt: Math.max(now, (previous?.modifiedAt ?? 0) + 1),
					ownerKey: owner,
					scopedId: scopedId(owner, id),
				}),
			);
			for (const statement of replayCreditBook(book).statements.filter(item =>
				book.statements.some(saved => saved.id === item.id),
			))
				await requestResult(
					tx.objectStore("scoped-creditCardStatements").put({
						data: { ...statement, totalAmount: Number(statement.totalAmount) + statement.chargesAmount },
						localId: statement.id,
						modifiedAt: now,
						ownerKey: owner,
						scopedId: scopedId(owner, statement.id),
					}),
				);
		}
		await done;
	} catch (error) {
		try {
			tx.abort();
		} catch {}
		await done.catch(() => undefined);
		throw error;
	}
}
export async function readLocalCreditBook(cardId: string, owner?: StorageOwner): Promise<CreditBook> {
	const [stored, cardRow, transactions] = await Promise.all([
		localCreditBooks.getById(cardId, owner),
		localCreditCards.getById(cardId, owner),
		localTransactions.getAll(owner),
	]);
	if (!cardRow || cardRow.deleted) throw new Error("Cartão não encontrado");
	const card = cardRow.data;
	const account = (await localAccounts.getById(card.financialAccountId, owner))?.data;
	const institutionId = account?.institutionId ?? null;
	const policy = institutionId ? await localMeta.get(`refund-policy-${institutionId}`, owner) : null;
	const book: CreditBook =
		stored && !stored.deleted
			? structuredClone(stored.data)
			: {
					card: {
						currency: card.currency ?? "BRL",
						dueDay: card.dueDay,
						id: cardId,
						ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
						institutionId,
						refundPolicy: null,
						statementDay: card.statementDay,
						userId: requireOwner(owner).split(":").slice(1).join(":"),
						workingDueDate: card.workingDueDate,
					},
					charges: [],
					installments: [],
					payments: [],
					purchases: [],
					refunds: [],
					statements: [],
				};
	Object.assign(book.card, {
		currency: card.currency ?? book.card.currency ?? "BRL",
		dueDay: card.dueDay,
		ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
		institutionId,
		refundPolicy: policy ?? book.card.refundPolicy,
		statementDay: card.statementDay,
		workingDueDate: card.workingDueDate,
	});
	book.payments = transactions
		.filter(row => !row.deleted && row.data.paymentCreditCardId === cardId)
		.map(row => ({
			amount: row.data.paymentAmount ?? row.data.amount,
			date: row.data.date.slice(0, 10),
			id: row.data.id,
		}));
	const rewardAccounts = new Map(
		(await localAccounts.getAll(owner)).map(row => [row.data.id, row.data.currency ?? "BRL"]),
	);
	for (const purchase of book.purchases)
		if (purchase.cashbackAccountId)
			purchase.cashbackCurrency ??= rewardAccounts.get(purchase.cashbackAccountId);
	return book;
}

export const localMeta = {
	get: async (key: string, ownerKey?: StorageOwner): Promise<unknown> => {
		const owner = requireOwner(ownerKey);
		return runTransaction(scopedStoreName("meta"), "readonly", async store => {
			const result = (await requestResult(store.get(scopedId(owner, key)))) as LocalData<unknown> | undefined;
			return result?.data;
		});
	},
	set: async (key: string, value: unknown, ownerKey?: StorageOwner): Promise<void> => {
		const owner = requireOwner(ownerKey);
		await runTransaction(scopedStoreName("meta"), "readwrite", async store => {
			await requestResult(
				store.put({
					data: value,
					localId: key,
					modifiedAt: Date.now(),
					ownerKey: owner,
					scopedId: scopedId(owner, key),
				}),
			);
		});
	},
};

/** Lifecycle materialization is separate from pure reads and preserves synced clocks when unchanged. */
export async function materializeLocalCreditBooks(owner: StorageOwner, asOf = currentDateKey()) {
	let changed = 0;
	for (const row of await localCreditBooks.getAll(owner)) {
		const book = structuredClone(row.data);
		const count = book.installments.length;
		materializeBookInstallments(book, asOf);
		if (book.installments.length === count) continue;
		await mutateLocalCreditBook(row.localId, () => undefined, owner, undefined, asOf);
		changed++;
	}
	return changed;
}

/** One IndexedDB transaction commits an occurrence, its financial effects and cursor. */
export async function commitLocalRecurrenceChanges(
	owner: StorageOwner,
	expected: LocalData<Recurrence>,
	recurrence: Recurrence,
	occurrences: RecurrenceOccurrence[],
	transactions: Transaction[],
	book?: CreditBook,
	expectedBook?: LocalData<CreditBook>,
) {
	const database = await initLocalDb();
	const tx = database.transaction(
		["scoped-recurrences", "scoped-recurrenceOccurrences", "scoped-transactions", "scoped-creditBooks"],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const store = tx.objectStore("scoped-recurrences");
		const current = (await requestResult(store.get(expected.scopedId))) as LocalData<Recurrence> | undefined;
		if (
			!current ||
			current.deleted ||
			current.modifiedAt !== expected.modifiedAt ||
			JSON.stringify(current.data) !== JSON.stringify(expected.data)
		)
			throw new Error("Recorrência mudou durante processamento. Tente novamente.");
		if (book) {
			const currentBook = await requestResult(
				tx.objectStore("scoped-creditBooks").get(scopedId(owner, book.card.id)),
			);
			if (JSON.stringify(currentBook) !== JSON.stringify(expectedBook))
				throw new Error("Cartão mudou durante processamento. Tente novamente.");
		}
		const now = Math.max(Date.now(), expected.modifiedAt + 1);
		const wrap = (data: unknown, localId: string) => ({
			data,
			localId,
			modifiedAt: now,
			ownerKey: owner,
			scopedId: scopedId(owner, localId),
		});
		for (const occurrence of occurrences) {
			if (
				await requestResult(
					tx.objectStore("scoped-recurrenceOccurrences").get(scopedId(owner, occurrence.id)),
				)
			)
				throw new Error("Ocorrência já processada.");
			await requestResult(
				tx.objectStore("scoped-recurrenceOccurrences").put(wrap(occurrence, occurrence.id)),
			);
		}
		for (const transaction of transactions)
			await requestResult(tx.objectStore("scoped-transactions").put(wrap(transaction, transaction.id)));
		if (book) await requestResult(tx.objectStore("scoped-creditBooks").put(wrap(book, book.card.id)));
		await requestResult(store.put(wrap(recurrence, recurrence.id)));
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
	await done;
}

/** Acknowledge exact sent revisions; remap legacy collisions without overwriting newer edits. */
export async function acknowledgeRecurrenceSync(
	sent: LocalData<Recurrence>[],
	received: Recurrence[],
	sentOccurrences: LocalData<RecurrenceOccurrence>[],
	receivedOccurrences: RecurrenceOccurrence[],
	owner: StorageOwner,
) {
	const database = await initLocalDb();
	const tx = database.transaction(
		["scoped-recurrences", "scoped-recurrenceOccurrences", "scoped-transactions", "scoped-creditBooks"],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const mappings = new Map<string, string>();
		const store = tx.objectStore("scoped-recurrences");
		for (const recurrence of received) {
			const source = sent.find(row => row.data.id === recurrence.id);
			if (source) mappings.set(source.localId, recurrence.id);
			const current = (await requestResult(store.get(scopedId(owner, source?.localId ?? recurrence.id)))) as
				| LocalData<Recurrence>
				| undefined;
			const unchanged =
				!current ||
				(source &&
					current.modifiedAt === source.modifiedAt &&
					JSON.stringify(current.data) === JSON.stringify(source.data));
			const now = Date.now();
			const data = unchanged ? recurrence : { ...current!.data, id: recurrence.id };
			if (source && source.localId !== recurrence.id)
				await requestResult(store.delete(scopedId(owner, source.localId)));
			await requestResult(
				store.put({
					...(unchanged ? {} : current),
					data,
					localId: recurrence.id,
					ownerKey: owner,
					scopedId: scopedId(owner, recurrence.id),
					...(unchanged
						? { modifiedAt: now, syncedAt: now }
						: { modifiedAt: Math.max(now, (current?.modifiedAt ?? 0) + 1) }),
				}),
			);
		}
		const occurrences = tx.objectStore("scoped-recurrenceOccurrences");
		for (const row of (await requestResult(
			occurrences.index("ownerKey").getAll(owner),
		)) as LocalData<RecurrenceOccurrence>[]) {
			const id = mappings.get(row.data.recurrenceId);
			if (!id || id === row.data.recurrenceId) continue;
			const localId = `${id}:${row.data.date}`;
			await requestResult(occurrences.delete(row.scopedId));
			await requestResult(
				occurrences.put({
					...row,
					data: { ...row.data, id: localId, recurrenceId: id },
					localId,
					scopedId: scopedId(owner, localId),
				}),
			);
		}
		for (const data of receivedOccurrences) {
			const source = sentOccurrences.find(
				row =>
					(mappings.get(row.data.recurrenceId) ?? row.data.recurrenceId) === data.recurrenceId &&
					row.data.date === data.date,
			);
			const current = (await requestResult(occurrences.get(scopedId(owner, data.id)))) as
				| LocalData<RecurrenceOccurrence>
				| undefined;
			if (current && (!source || current.modifiedAt !== source.modifiedAt)) continue;
			const now = Date.now();
			await requestResult(
				occurrences.put({
					data,
					localId: data.id,
					modifiedAt: now,
					ownerKey: owner,
					scopedId: scopedId(owner, data.id),
					syncedAt: now,
				}),
			);
		}
		for (const row of (await requestResult(
			tx.objectStore("scoped-transactions").index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[])
			if (row.data.recurrenceId && mappings.get(row.data.recurrenceId) !== undefined) {
				const recurrenceId = mappings.get(row.data.recurrenceId)!;
				if (recurrenceId !== row.data.recurrenceId)
					await requestResult(
						tx.objectStore("scoped-transactions").put({ ...row, data: { ...row.data, recurrenceId } }),
					);
			}
		for (const row of (await requestResult(
			tx.objectStore("scoped-creditBooks").index("ownerKey").getAll(owner),
		)) as LocalData<CreditBook>[]) {
			const purchases = row.data.purchases.map(p =>
				p.recurrenceId && mappings.has(p.recurrenceId)
					? { ...p, recurrenceId: mappings.get(p.recurrenceId)! }
					: p,
			);
			if (JSON.stringify(purchases) !== JSON.stringify(row.data.purchases))
				await requestResult(
					tx.objectStore("scoped-creditBooks").put({ ...row, data: { ...row.data, purchases } }),
				);
		}
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
	await done;
}

/** Deletion and detachment share the same local boundary as occurrence creation. */
export async function deleteLocalRecurrence(owner: StorageOwner, id: string, removeConcrete: boolean) {
	const database = await initLocalDb();
	const tx = database.transaction(
		["scoped-recurrences", "scoped-recurrenceOccurrences", "scoped-transactions", "scoped-creditBooks"],
		"readwrite",
	);
	const done = transactionDone(tx);
	const now = Date.now();
	try {
		const store = tx.objectStore("scoped-recurrences");
		const record = (await requestResult(store.get(scopedId(owner, id)))) as LocalData<Recurrence> | undefined;
		if (!record) {
			await done;
			return;
		}
		const transactions = tx.objectStore("scoped-transactions");
		for (const row of (await requestResult(
			transactions.index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[])
			if (row.data.recurrenceId === id) {
				const data = { ...row.data, recurrenceId: undefined, recurrenceOccurrenceDate: undefined };
				if (removeConcrete && owner.startsWith("user:"))
					await requestResult(transactions.delete(row.scopedId));
				else
					await requestResult(
						transactions.put({
							...row,
							data,
							deleted: row.deleted || removeConcrete,
							modifiedAt: Math.max(now, row.modifiedAt + 1),
						}),
					);
			}
		const books = tx.objectStore("scoped-creditBooks");
		for (const row of (await requestResult(
			books.index("ownerKey").getAll(owner),
		)) as LocalData<CreditBook>[]) {
			const linked = new Set(row.data.purchases.filter(p => p.recurrenceId === id).map(p => p.id));
			if (!linked.size) continue;
			const book = structuredClone(row.data);
			if (removeConcrete) {
				book.deletedPurchaseIds = [...new Set([...(book.deletedPurchaseIds ?? []), ...linked])];
				book.purchases = book.purchases.filter(p => !linked.has(p.id));
				book.installments = book.installments.filter(i => !linked.has(i.purchaseId));
				book.refunds = book.refunds.filter(r => !linked.has(r.purchaseId));
			} else
				for (const purchase of book.purchases)
					if (linked.has(purchase.id)) {
						purchase.recurrenceId = null;
						purchase.recurrenceOccurrenceDate = null;
					}
			await requestResult(books.put({ ...row, data: book, modifiedAt: Math.max(now, row.modifiedAt + 1) }));
		}
		const occurrences = tx.objectStore("scoped-recurrenceOccurrences");
		for (const row of (await requestResult(
			occurrences.index("ownerKey").getAll(owner),
		)) as LocalData<RecurrenceOccurrence>[])
			if (row.data.recurrenceId === id) {
				if (owner.startsWith("user:")) await requestResult(occurrences.delete(row.scopedId));
				else
					await requestResult(
						occurrences.put({ ...row, deleted: true, modifiedAt: Math.max(now, row.modifiedAt + 1) }),
					);
			}
		if (owner.startsWith("user:")) await requestResult(store.delete(record.scopedId));
		else
			await requestResult(
				store.put({ ...record, deleted: true, modifiedAt: Math.max(now, record.modifiedAt + 1) }),
			);
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
	await done;
}

export async function createLocalLoanWithPayments(
	loan: Loan,
	payments: LoanPayment[],
	ownerKey?: StorageOwner,
) {
	const owner = requireOwner(ownerKey);
	const database = await initLocalDb();
	const tx = database.transaction(["scoped-loans", "scoped-loanPayments"], "readwrite");
	const done = transactionDone(tx);
	const now = Date.now();
	const wrap = (data: Loan | LoanPayment) => ({
		createdAt: now,
		data,
		localId: data.id,
		modifiedAt: now,
		ownerKey: owner,
		scopedId: scopedId(owner, data.id),
	});
	tx.objectStore("scoped-loans").put(wrap(loan));
	for (const payment of payments) tx.objectStore("scoped-loanPayments").put(wrap(payment));
	await done;
}

export async function payLocalLoanInstallment(
	loanId: string,
	number: number,
	paidDate: string,
	financialAccountId?: string,
	ownerKey?: StorageOwner,
	booking?: {
		accountCurrency: string | null;
		accountAmounts: Record<string, number | null>;
		financialAccountId?: string;
	},
) {
	validateLoanPaidDate(paidDate);
	const owner = requireOwner(ownerKey);
	const database = await initLocalDb();
	const tx = database.transaction("scoped-loanPayments", "readwrite");
	const done = transactionDone(tx);
	const store = tx.objectStore("scoped-loanPayments");
	try {
		const rows = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<LoanPayment>[];
		const record = rows.find(
			row => !row.deleted && row.data.loanId === loanId && row.data.installmentNumber === number,
		);
		if (!record || record.data.paidDate) throw new Error("Parcela indisponível para pagamento");
		const accountAmount = booking?.accountAmounts[record.data.id];
		if (booking && accountAmount === undefined)
			throw new Error("Parcela mudou durante conversão; tente novamente");
		const updated = {
			...record.data,
			financialAccountId,
			paidDate,
			...(booking && { accountAmount, accountCurrency: booking.accountCurrency }),
		};
		store.put({ ...record, data: updated, modifiedAt: Math.max(Date.now(), record.modifiedAt + 1) });
		await done;
		return updated;
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}

export async function advanceLocalLoanInstallments(
	loanId: string,
	count: number,
	advanceType: "FRONT" | "BACK",
	paidDate: string,
	ownerKey?: StorageOwner,
	booking?: {
		accountCurrency: string | null;
		accountAmounts: Record<string, number | null>;
		financialAccountId?: string;
	},
) {
	const owner = requireOwner(ownerKey);
	validateLoanPaidDate(paidDate);
	if (advanceType !== "FRONT" && advanceType !== "BACK") throw new Error("Tipo de antecipação inválido");
	if (!Number.isSafeInteger(count) || count < 1) throw new Error("Quantidade inválida");
	const database = await initLocalDb();
	const tx = database.transaction("scoped-loanPayments", "readwrite");
	const done = transactionDone(tx);
	const store = tx.objectStore("scoped-loanPayments");
	try {
		const rows = ((await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<LoanPayment>[])
			.filter(row => !row.deleted && row.data.loanId === loanId && !row.data.paidDate)
			.sort((a, b) =>
				advanceType === "FRONT"
					? a.data.installmentNumber - b.data.installmentNumber
					: b.data.installmentNumber - a.data.installmentNumber,
			)
			.slice(0, count);
		if (!rows.length) throw new Error("Não há parcelas pendentes");
		if (booking && rows.some(row => booking.accountAmounts[row.data.id] === undefined))
			throw new Error("Parcelas mudaram durante conversão; tente novamente");
		for (const row of rows)
			store.put({
				...row,
				data: {
					...row.data,
					advanceType,
					isAdvanced: true,
					paidDate,
					...(booking && {
						accountAmount: booking.accountAmounts[row.data.id],
						accountCurrency: booking.accountCurrency,
						financialAccountId: booking.financialAccountId,
					}),
				},
				modifiedAt: Math.max(Date.now(), row.modifiedAt + 1),
			});
		await done;
		return {
			advancedInstallments: rows.length,
			advanceType,
			totalPaid: rows.reduce((sum, row) => sum + row.data.totalPaid, 0),
		};
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}

function validateLoanPaidDate(value: string) {
	if (
		!/^\d{4}-\d{2}-\d{2}$/.test(value) ||
		!Number.isFinite(Date.parse(value)) ||
		new Date(value).toISOString().slice(0, 10) !== value
	)
		throw new Error("Data inválida");
}

/** Capture sent clocks before the request so concurrent local edits survive acknowledgement. */
export async function acknowledgeDebtEventSync(
	sent: LocalData<StoredDebtEvent>[],
	remote: StoredDebtEvent[],
	ownerKey: StorageOwner,
) {
	await runTransaction("scoped-debtEvents", "readwrite", async store => {
		for (const data of remote) {
			const key = scopedId(ownerKey, data.id);
			const current = (await requestResult(store.get(key))) as LocalData<StoredDebtEvent> | undefined;
			const previous = sent.find(row => row.localId === data.id);
			if (
				current &&
				(!previous || current.modifiedAt !== previous.modifiedAt || current.deleted !== previous.deleted)
			)
				continue;
			const clock = current?.modifiedAt ?? Date.now();
			await requestResult(
				store.put({
					data,
					deleted: Boolean(data.deletedAt),
					localId: data.id,
					modifiedAt: clock,
					ownerKey,
					scopedId: key,
					syncedAt: clock,
				}),
			);
		}
	});
}

export async function createLocalDebtOrigins(events: StoredDebtEvent[], ownerKey?: StorageOwner) {
	const owner = requireOwner(ownerKey);
	await runTransaction("scoped-debtEvents", "readwrite", async store => {
		for (const data of events) {
			const key = scopedId(owner, data.id);
			if (await requestResult(store.get(key))) throw new Error("Origem já existe");
			await requestResult(
				store.put({ data, localId: data.id, modifiedAt: Date.now(), ownerKey: owner, scopedId: key }),
			);
		}
	});
}

export async function saveLocalAccountDefaults(
	account: FinancialAccount,
	options: { create?: boolean; isPrimary?: boolean; isDefaultForStatements?: boolean } = {},
) {
	const owner = requireOwner();
	const database = await initLocalDb();
	const tx = database.transaction("scoped-accounts", "readwrite");
	const done = transactionDone(tx);
	try {
		const store = tx.objectStore("scoped-accounts");
		const rows = (await requestResult(
			store.index("ownerKey").getAll(owner),
		)) as LocalData<FinancialAccount>[];
		const eligible = !account.isHidden && ["CHECKING", "CASH"].includes(account.type);
		const statementEligible =
			!account.isHidden && ["CHECKING", "CASH", "SAVINGS", "INVESTMENT"].includes(account.type);
		if ((!eligible && options.isPrimary) || (!statementEligible && options.isDefaultForStatements))
			throw new Error("Selecione uma conta corrente ou dinheiro disponível");
		const previous = rows.find(row => row.localId === account.id);
		const updated = {
			...account,
			isDefaultForStatements:
				statementEligible &&
				(options.isDefaultForStatements ?? previous?.data.isDefaultForStatements ?? false),
			isPrimary:
				eligible &&
				((options.create && !rows.some(row => !row.deleted && row.data.isPrimary)) ||
					(options.isPrimary ?? previous?.data.isPrimary ?? false)),
		};
		for (const row of rows) {
			if (row.localId === account.id) continue;
			if (
				!(updated.isPrimary && row.data.isPrimary) &&
				!(updated.isDefaultForStatements && row.data.isDefaultForStatements)
			)
				continue;
			await requestResult(
				store.put({
					...row,
					data: {
						...row.data,
						isDefaultForStatements: updated.isDefaultForStatements ? false : row.data.isDefaultForStatements,
						isPrimary: updated.isPrimary ? false : row.data.isPrimary,
					},
					modifiedAt: Date.now(),
					syncedAt: undefined,
				}),
			);
		}
		await requestResult(
			store.put({
				...previous,
				data: updated,
				localId: account.id,
				modifiedAt: Date.now(),
				ownerKey: owner,
				scopedId: scopedId(owner, account.id),
				syncedAt: undefined,
			}),
		);
		await done;
		return updated;
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}

export async function setLocalPrimaryAccount(accountId: string | null) {
	const owner = requireOwner();
	const database = await initLocalDb();
	const tx = database.transaction("scoped-accounts", "readwrite");
	const done = transactionDone(tx);
	try {
		const store = tx.objectStore("scoped-accounts");
		const rows = (await requestResult(
			store.index("ownerKey").getAll(owner),
		)) as LocalData<FinancialAccount>[];
		if (
			accountId &&
			!rows.some(
				row =>
					row.localId === accountId &&
					!row.deleted &&
					!row.data.isHidden &&
					["CHECKING", "CASH"].includes(row.data.type),
			)
		)
			throw new Error("Selecione uma conta corrente ou dinheiro disponível");
		for (const row of rows) {
			await requestResult(
				store.put({
					...row,
					data: { ...row.data, isPrimary: row.localId === accountId },
					modifiedAt: Date.now(),
					syncedAt: undefined,
				}),
			);
		}
		await done;
		return { financialAccountId: accountId };
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}

export async function confirmLocalSuggestedPayment(
	cardId: string,
	input: {
		amount: number;
		attemptId: string;
		date: string;
		financialAccountId: string;
		statementId: string;
	},
) {
	const owner = requireOwner();
	const database = await initLocalDb();
	const tx = database.transaction(
		["scoped-accounts", "scoped-transactions", "scoped-creditBooks", "scoped-creditCards", "scoped-meta"],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		const getRows = async <T>(name: string) =>
			((await requestResult(tx.objectStore(name).index("ownerKey").getAll(owner))) as LocalData<T>[]).filter(
				row => !row.deleted,
			);
		const transactions = await getRows<Transaction>("scoped-transactions");
		const previous = transactions.find(row => row.localId === input.attemptId)?.data;
		if (previous) {
			if (
				previous.paymentCreditCardId !== cardId ||
				previous.originFinancialAccountId !== input.financialAccountId ||
				moneyCents(previous.amount) !== moneyCents(input.amount) ||
				previous.date.slice(0, 10) !== input.date
			)
				throw new Error("Tentativa de pagamento já utilizada");
			await done;
			return { transaction: previous };
		}
		const accounts = await getRows<FinancialAccount>("scoped-accounts");
		const cards = await getRows<CreditCard>("scoped-creditCards");
		const books = await getRows<CreditBook>("scoped-creditBooks");
		const card = cards.find(row => row.localId === cardId)?.data;
		const storedBook = books.find(row => row.localId === cardId)?.data;
		const account = accounts.find(row => row.localId === input.financialAccountId)?.data;
		if (!card || !storedBook) throw new Error("Cartão indisponível");
		if (!account || account.isHidden || ["CREDIT_CARD", "REWARDS"].includes(account.type))
			throw new Error("Conta pagadora indisponível");
		const book = structuredClone(storedBook);
		book.payments = transactions
			.filter(row => row.data.paymentCreditCardId === cardId)
			.map(row => ({
				amount: row.data.paymentAmount ?? row.data.amount,
				date: row.data.date.slice(0, 10),
				id: row.localId,
			}));
		const suggestion = pendingStatementPayments(book).find(row => row.statementId === input.statementId);
		if (!suggestion || moneyCents(suggestion.amount) !== moneyCents(input.amount))
			throw new Error("Saldo da fatura mudou. Revise o pagamento novamente");
		const meta = tx.objectStore("scoped-meta");
		const holidayData = (await requestResult(
			meta.get(scopedId(owner, "financial-account-yield-holidays")),
		)) as LocalData<import("./api").FinancialAccountYieldHoliday[]> | undefined;
		const yieldData = (await requestResult(meta.get(scopedId(owner, "financial-account-yields")))) as
			| LocalData<import("./api").FinancialAccountYield[]>
			| undefined;
		const datedStatement = replayCreditBook(book, input.date).statements.find(
			row => row.id === input.statementId,
		);
		if (
			!datedStatement ||
			(datedStatement.statementDate > input.date && datedStatement.carriedInAmount <= 0) ||
			moneyCents(Math.max(0, datedStatement.balanceAmount)) < moneyCents(input.amount)
		)
			throw new Error("Fatura indisponível para pagamento na data informada");
		const balance =
			calculateFinancialAccountBalances(
				accounts.map(row => row.data),
				transactions.map(row => row.data),
				books.flatMap(row => creditBookRewards(row.data)),
				holidayData?.data.map(row => row.date) ?? [],
				new Date(`${input.date}T12:00:00`),
				yieldData?.data ?? [],
			).find(row => row.id === account.id)?.balance ?? 0;
		if (moneyCents(balance) < moneyCents(input.amount))
			throw new Error("Saldo insuficiente na conta pagadora na data informada");
		const transaction: Transaction = {
			amount: input.amount,
			createdAt: new Date().toISOString(),
			date: input.date,
			id: input.attemptId,
			originFinancialAccountId: input.financialAccountId,
			paymentCreditCardId: cardId,
			type: "EXPENSE",
		};
		await requestResult(
			tx.objectStore("scoped-transactions").put({
				data: transaction,
				localId: transaction.id,
				modifiedAt: Date.now(),
				ownerKey: owner,
				scopedId: scopedId(owner, transaction.id),
			}),
		);
		await done;
		return { transaction };
	} catch (error) {
		tx.abort();
		await done.catch(() => undefined);
		throw error;
	}
}
