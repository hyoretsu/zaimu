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

const DB_NAME = "zaimu-local";
const DB_VERSION = 5;

const LEGACY_STORES = {
	accounts: "accounts",
	categories: "categories",
	creditCardStatements: "creditCardStatements",
	creditCards: "creditCards",
	creditPurchases: "creditPurchases",
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

export async function initLocalDb(): Promise<IDBDatabase> {
	if (db) {
		await migrationPromise;
		return db;
	}

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
		migrationPromise = null;
	};
	db = database;
	migrationPromise = migrateLegacyData(database);
	await migrationPromise;
	return database;
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
export const localCreditPurchases = createLocalStore<CreditPurchase>("creditPurchases");
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
