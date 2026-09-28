import {
	type CreditBook,
	creditBookEntries,
	materializeBookInstallments,
	moveBookPurchase,
	replayCreditBook,
} from "@zaimu/finance/credit-book";
import { currentDateKey, statementEntryKind } from "@zaimu/finance/credit-card";
import type {
	Category,
	CreditCard,
	CreditCardStatement,
	CreditPurchase,
	Debt,
	DebtPerson,
	FinancialAccount,
	Loan,
	RecurringPayment,
	Salary,
	Store,
	Subscription,
	Transaction,
} from "@/lib/api";
import { type CacheIdentity, getCurrentCacheIdentity } from "@/lib/query-cache";
import { calculateDebtSplit } from "./debt-split";
import { migrateLegacyCardPayments } from "./legacy-card-payments";
import { migrateCreditBooks } from "./migrate-credit-books";

const DB_NAME = "zaimu-local";
const DB_VERSION = 7;

const LEGACY_STORES = {
	accounts: "accounts",
	categories: "categories",
	creditBooks: "creditBooks",
	creditCardStatements: "creditCardStatements",
	creditCards: "creditCards",
	creditPurchases: "creditPurchases",
	creditRefundReviews: "creditRefundReviews",
	debtPeople: "debtPeople",
	debts: "debts",
	loans: "loans",
	meta: "meta",
	recurringPayments: "recurringPayments",
	salaries: "salaries",
	stores: "stores",
	subscriptions: "subscriptions",
	transactions: "transactions",
} as const;

type StoreDomain = keyof typeof LEGACY_STORES;
type ScopedStoreName = `scoped-${(typeof LEGACY_STORES)[StoreDomain]}`;
export type StorageOwner = CacheIdentity;

const scopedStoreName = (domain: StoreDomain): ScopedStoreName => `scoped-${LEGACY_STORES[domain]}`;

export interface LocalData<T> {
	data: T;
	deleted?: boolean;
	localId: string;
	modifiedAt: number;
	ownerKey: StorageOwner;
	scopedId: string;
	syncedAt?: number;
}

interface LegacyLocalData<T = unknown> {
	data: T;
	deleted?: boolean;
	localId: string;
	modifiedAt?: number;
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

function requestResult<T>(request: IDBRequest<T>): Promise<T> {
	return new Promise((resolve, reject) => {
		request.onsuccess = () => resolve(request.result);
		request.onerror = () => reject(request.error);
	});
}

function transactionDone(transaction: IDBTransaction): Promise<void> {
	return new Promise((resolve, reject) => {
		transaction.oncomplete = () => resolve();
		transaction.onabort = () => reject(transaction.error ?? new Error("Transação IndexedDB cancelada."));
		transaction.onerror = () => reject(transaction.error ?? new Error("Falha na transação IndexedDB."));
	});
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

const relationshipIds = [
	"financialAccountId",
	"originFinancialAccountId",
	"destinationFinancialAccountId",
	"creditCardId",
	"paymentCreditCardId",
	"creditCardStatementId",
	"debtPersonId",
	"loanId",
] as const;

function relatedOwners(
	data: unknown,
	ownersByRecordId: ReadonlyMap<string, ReadonlySet<StorageOwner>>,
): Set<StorageOwner> {
	const owners = new Set<StorageOwner>();
	if (!data || typeof data !== "object") return owners;
	const value = data as Record<string, unknown>;
	for (const relationshipId of relationshipIds) {
		const id = value[relationshipId];
		if (typeof id !== "string") continue;
		for (const owner of ownersByRecordId.get(id) ?? []) owners.add(owner);
	}
	return owners;
}

async function migrateLegacyData(database: IDBDatabase): Promise<void> {
	const legacyDomains = (Object.keys(LEGACY_STORES) as StoreDomain[]).filter(domain =>
		database.objectStoreNames.contains(LEGACY_STORES[domain]),
	);
	const records = new Map<StoreDomain, LegacyLocalData[]>();
	for (const domain of legacyDomains) {
		const transaction = database.transaction(LEGACY_STORES[domain], "readonly");
		records.set(domain, await requestResult(transaction.objectStore(LEGACY_STORES[domain]).getAll()));
	}

	const ownersByRecordId = new Map<string, Set<StorageOwner>>();
	for (const items of records.values()) {
		for (const item of items) {
			const owner = explicitOwner(item.data);
			if (!owner) continue;
			const owners = ownersByRecordId.get(item.localId) ?? new Set<StorageOwner>();
			owners.add(owner);
			ownersByRecordId.set(item.localId, owners);
		}
	}

	for (const [domain, items] of records) {
		const attributable = items.flatMap(item => {
			const directOwner = explicitOwner(item.data);
			const related = relatedOwners(item.data, ownersByRecordId);
			const owner = directOwner ?? (related.size === 1 ? [...related][0] : null);
			return owner ? [{ item, owner }] : [];
		});
		if (!attributable.length) continue;
		await runTransaction(
			scopedStoreName(domain),
			"readwrite",
			async store => {
				for (const { item, owner } of attributable) {
					const key = scopedId(owner, item.localId);
					const existing = await requestResult(store.get(key));
					if (existing) continue;
					await requestResult(
						store.put({
							...item,
							modifiedAt: item.modifiedAt ?? Date.now(),
							ownerKey: owner,
							scopedId: key,
						}),
					);
				}
			},
			database,
		);
	}
}

async function migrateCardPayments(database: IDBDatabase): Promise<void> {
	const transaction = database.transaction(
		[
			scopedStoreName("transactions"),
			scopedStoreName("creditCardStatements"),
			scopedStoreName("creditPurchases"),
		],
		"readwrite",
	);
	const completion = transactionDone(transaction);
	const paymentsStore = transaction.objectStore(scopedStoreName("transactions"));
	const purchasesStore = transaction.objectStore(scopedStoreName("creditPurchases"));
	const [payments, statements, purchases] = await Promise.all([
		requestResult(paymentsStore.getAll()),
		requestResult(transaction.objectStore(scopedStoreName("creditCardStatements")).getAll()),
		requestResult(purchasesStore.getAll()),
	]);
	const migrated = migrateLegacyCardPayments(payments, statements);
	for (let index = 0; index < payments.length; index++)
		if (payments[index] !== migrated[index]) paymentsStore.put(migrated[index]);
	for (const row of purchases)
		if (
			row.data.isStatementCharge === undefined &&
			statementEntryKind(row.data.description ?? "") === "CHARGE"
		)
			purchasesStore.put({
				...row,
				data: { ...row.data, cashbackAccountId: null, cashbackAmount: null, isStatementCharge: true },
			});
	await completion;
}

async function openLocalDb(): Promise<IDBDatabase> {
	const database = await new Promise<IDBDatabase>((resolve, reject) => {
		const request = indexedDB.open(DB_NAME, DB_VERSION);
		request.onerror = () => reject(request.error);
		request.onblocked = () => reject(new Error("Banco local bloqueado por outra aba."));
		request.onsuccess = () => resolve(request.result);
		request.onupgradeneeded = () => {
			for (const domain of Object.keys(LEGACY_STORES) as StoreDomain[]) {
				const name = scopedStoreName(domain);
				if (request.result.objectStoreNames.contains(name)) continue;
				const store = request.result.createObjectStore(name, { keyPath: "scopedId" });
				store.createIndex("ownerKey", "ownerKey", { unique: false });
				store.createIndex("syncedAt", "syncedAt", { unique: false });
				store.createIndex("modifiedAt", "modifiedAt", { unique: false });
				store.createIndex("deleted", "deleted", { unique: false });
			}
		};
	});
	database.onversionchange = () => {
		database.close();
		db = null;
		dbInitializationPromise = null;
		migrationPromise = null;
	};
	db = database;
	migrationPromise = migrateLegacyData(database)
		.then(() => migrateCardPayments(database))
		.then(() => migrateCreditBooks(database));
	await migrationPromise;
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
		await requestResult(
			store.put({
				data,
				localId: id,
				modifiedAt: timestamp,
				ownerKey: owner,
				scopedId: scopedId(owner, id),
				...(owner.startsWith("user:") && { syncedAt: timestamp }),
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
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const key = scopedId(owner, localId);
		if (owner.startsWith("user:")) {
			await requestResult(store.delete(key));
			return;
		}
		const item = (await requestResult(store.get(key))) as LocalData<unknown> | undefined;
		if (!item) return;
		await requestResult(store.put({ ...item, deleted: true, modifiedAt: Date.now() }));
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
	return (await getAll<T>(domain, ownerKey)).filter(item => item.modifiedAt > since);
}

function isLocallyModified(item: LocalData<unknown>): boolean {
	return item.syncedAt === undefined || item.modifiedAt > item.syncedAt;
}

export async function bulkPut<T>(
	domain: StoreDomain,
	items: Array<{ data: T; localId: string; syncedAt?: number }>,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		for (const item of items) {
			const key = scopedId(owner, item.localId);
			const existing = (await requestResult(store.get(key))) as LocalData<T> | undefined;
			if (existing && isLocallyModified(existing)) continue;
			const timestamp = item.syncedAt ?? Date.now();
			await requestResult(
				store.put({
					data: item.data,
					localId: item.localId,
					modifiedAt: timestamp,
					ownerKey: owner,
					scopedId: key,
					syncedAt: timestamp,
				}),
			);
		}
	});
}

export async function replaceRemoteSnapshot<T>(
	domain: StoreDomain,
	items: Array<{ data: T; localId: string; syncedAt?: number }>,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	const remoteIds = new Set(items.map(item => item.localId));
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const existing = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<T>[];
		for (const item of existing) {
			if (!remoteIds.has(item.localId) && !isLocallyModified(item))
				await requestResult(store.delete(item.scopedId));
		}
		for (const item of items) {
			const key = scopedId(owner, item.localId);
			const current = existing.find(record => record.localId === item.localId);
			if (current && isLocallyModified(current)) continue;
			const timestamp = item.syncedAt ?? Date.now();
			await requestResult(
				store.put({
					data: item.data,
					localId: item.localId,
					modifiedAt: timestamp,
					ownerKey: owner,
					scopedId: key,
					syncedAt: timestamp,
				}),
			);
		}
	});
}

export async function replaceRemoteSlice<T>(
	domain: StoreDomain,
	items: Array<{ data: T; localId: string; syncedAt?: number }>,
	belongsToSlice: (data: T) => boolean,
	ownerKey?: StorageOwner,
): Promise<void> {
	const owner = requireOwner(ownerKey);
	const remoteIds = new Set(items.map(item => item.localId));
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const existing = (await requestResult(store.index("ownerKey").getAll(owner))) as LocalData<T>[];
		for (const item of existing) {
			if (belongsToSlice(item.data) && !remoteIds.has(item.localId) && !isLocallyModified(item))
				await requestResult(store.delete(item.scopedId));
		}
		for (const item of items) {
			const key = scopedId(owner, item.localId);
			const current = existing.find(record => record.localId === item.localId);
			if (current && isLocallyModified(current)) continue;
			const timestamp = item.syncedAt ?? Date.now();
			await requestResult(
				store.put({
					data: item.data,
					localId: item.localId,
					modifiedAt: timestamp,
					ownerKey: owner,
					scopedId: key,
					syncedAt: timestamp,
				}),
			);
		}
	});
}

export async function clearStore(domain: StoreDomain, ownerKey?: StorageOwner): Promise<void> {
	const owner = requireOwner(ownerKey);
	await runTransaction(scopedStoreName(domain), "readwrite", async store => {
		const keys = await requestResult(store.index("ownerKey").getAllKeys(owner));
		for (const key of keys) await requestResult(store.delete(key));
	});
}

export async function clearAllLocalData(ownerKey?: StorageOwner): Promise<void> {
	const owner = requireOwner(ownerKey);
	for (const domain of Object.keys(LEGACY_STORES) as StoreDomain[]) await clearStore(domain, owner);
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
export const localLoans = createLocalStore<Loan>("loans");
export const localDebts = createLocalStore<Debt>("debts");
export const localDebtPeople = createLocalStore<DebtPerson>("debtPeople");
export const localSalaries = createLocalStore<Salary>("salaries");
export const localSubscriptions = createLocalStore<Subscription>("subscriptions");
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
		categoryId: entry.categoryId ?? undefined,
		creditCardId: "creditCardId" in entry ? entry.creditCardId : undefined,
		feeAmount: ("feeAmount" in entry ? entry.feeAmount : null) ?? undefined,
		feeDescription: ("feeDescription" in entry ? entry.feeDescription : null) ?? undefined,
		parentId: entry.parentId ?? undefined,
		purchaseId: entry.purchaseId ?? undefined,
		refinancingFeeAmount: ("refinancingFeeAmount" in entry ? entry.refinancingFeeAmount : null) ?? undefined,
		refundOfPurchaseId: entry.refundOfPurchaseId ?? undefined,
		storeName: entry.storeName ?? undefined,
		subscriptionId: ("subscriptionId" in entry ? entry.subscriptionId : null) ?? undefined,
		subscriptionOccurrenceDate:
			("subscriptionOccurrenceDate" in entry ? entry.subscriptionOccurrenceDate : null) ?? undefined,
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
			"scoped-subscriptions",
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
				dueDay: card.dueDay,
				id: cardId,
				ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
				institutionId,
				refundPolicy: null,
				statementDay: card.statementDay,
				userId: owner.split(":").slice(1).join(":"),
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
		});
		const transactions = (await requestResult(
			tx.objectStore("scoped-transactions").index("ownerKey").getAll(owner),
		)) as LocalData<Transaction>[];
		book.payments = transactions
			.filter(row => !row.deleted && row.data.paymentCreditCardId === cardId)
			.map(row => ({ amount: row.data.amount, date: row.data.date.slice(0, 10), id: row.data.id }));
		const oldPolicy = book.card.refundPolicy;
		const result = operation(book);
		for (const p of book.purchases) {
			if (p.userId !== book.card.userId || p.creditCardId !== cardId)
				throw new Error("Titularidade da compra inválida");
			for (const id of new Set([...p.tagIds, ...(p.categoryId ? [p.categoryId] : [])]))
				if (!(await requestResult(tx.objectStore("scoped-categories").get(scopedId(owner, id)))))
					throw new Error("Tag indisponível");
			for (const [store, id] of [
				["scoped-accounts", p.cashbackAccountId],
				["scoped-subscriptions", p.subscriptionId],
			] as const)
				if (id && !(await requestResult(tx.objectStore(store).get(scopedId(owner, id)))))
					throw new Error("Vínculo indisponível");
			if (p.debtSplitRule) {
				if (!calculateDebtSplit(p.totalAmountCents / 100, p.debtSplitRule))
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
				.map(row => ({ amount: row.data.amount, date: row.data.date.slice(0, 10), id: row.data.id }));
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
						dueDay: card.dueDay,
						id: cardId,
						ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
						institutionId,
						refundPolicy: null,
						statementDay: card.statementDay,
						userId: requireOwner(owner).split(":").slice(1).join(":"),
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
		refundPolicy: policy ?? book.card.refundPolicy,
		statementDay: card.statementDay,
	});
	book.payments = transactions
		.filter(row => !row.deleted && row.data.paymentCreditCardId === cardId)
		.map(row => ({ amount: row.data.amount, date: row.data.date.slice(0, 10), id: row.data.id }));
	return book;
}

export const localRecurringPayments = createLocalStore<RecurringPayment>("recurringPayments");

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
