import { statementEntryKind } from "@zaimu/finance/credit-card";
import { loanInstallments } from "@zaimu/finance/loan";
import type { CreditCard, FinancialAccount, Loan, LoanPayment } from "../api";
import { requestResult, transactionDone } from "../idb";
import type { LocalData } from "../localStorage";
import type { CacheIdentity } from "../query-cache";
import { hasUnresolvedLegacyCardPayment, migrateLegacyCardPayments } from "./legacy-card-payments";
import { migrateCreditBooks } from "./migrate-credit-books";
import { migrateDebts } from "./migrate-debts";
import { migrateLocalRecurrenceRows } from "./migrate-recurrences";

const scopedId = (owner: StorageOwner, id: string) => `${owner}\u0000${id}`;
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
	loanPayments: "loanPayments",
	loans: "loans",
	meta: "meta",
	recurrenceOccurrences: "recurrenceOccurrences",
	recurrences: "recurrences",
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

interface LegacyLocalData<T = unknown> {
	data: T;
	deleted?: boolean;
	localId: string;
	modifiedAt?: number;
	syncedAt?: number;
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

const relationshipDomains = {
	creditCardId: "creditCards",
	creditCardStatementId: "creditCardStatements",
	debtPersonId: "debtPeople",
	destinationFinancialAccountId: "accounts",
	financialAccountId: "accounts",
	loanId: "loans",
	originFinancialAccountId: "accounts",
	paymentCreditCardId: "creditCards",
	statementId: "creditCardStatements",
} as const satisfies Record<string, StoreDomain>;

const recordKey = (domain: StoreDomain, id: string) => `${domain}:${id}`;

// A global sync cursor cannot prove ownership or be reused as an account cursor.
const isObsoleteSyncCursor = (domain: StoreDomain, row: LegacyLocalData) =>
	domain === "meta" && row.localId === "lastSyncAt";

function referencedPeople(data: unknown): Set<string> {
	const ids = new Set<string>();
	if (!data || typeof data !== "object") return ids;
	const value = data as Record<string, unknown>;
	for (const field of ["debtPersonId", "personId"])
		if (typeof value[field] === "string") ids.add(value[field]);
	for (const field of ["debtSplit", "debtSplitRule", "participants", "events", "purchases", "charges"])
		for (const child of Array.isArray(value[field]) ? value[field] : [value[field]])
			for (const id of referencedPeople(child)) ids.add(id);
	return ids;
}

/** Resolve proven ownership without using the current session. */
async function resolveLegacyOwnership(database: IDBDatabase, tx: IDBTransaction) {
	const records = new Map<StoreDomain, LegacyLocalData[]>();
	const ownersByRecordId = new Map<string, Set<StorageOwner>>();
	const fixedOwners = new Map<string, StorageOwner>();
	const personEvidence: Array<{ ids: Set<string>; sourceKey?: string; owner?: StorageOwner }> = [];
	if (database.objectStoreNames.contains("scoped-debtEvents"))
		for (const row of await requestResult(tx.objectStore("scoped-debtEvents").getAll()))
			personEvidence.push({ ids: referencedPeople(row.data), owner: row.ownerKey });
	for (const domain of Object.keys(LEGACY_STORES) as StoreDomain[]) {
		const scopedName = scopedStoreName(domain);
		if (database.objectStoreNames.contains(scopedName))
			for (const row of await requestResult(tx.objectStore(scopedName).getAll())) {
				const key = recordKey(domain, row.localId);
				const candidates = ownersByRecordId.get(key) ?? new Set<StorageOwner>();
				candidates.add(row.ownerKey);
				ownersByRecordId.set(key, candidates);
				if (domain !== "debtPeople")
					personEvidence.push({ ids: referencedPeople(row.data), owner: row.ownerKey });
			}
		if (!database.objectStoreNames.contains(LEGACY_STORES[domain])) continue;
		const items: LegacyLocalData[] = await requestResult(tx.objectStore(LEGACY_STORES[domain]).getAll());
		records.set(
			domain,
			items.filter(item => !isObsoleteSyncCursor(domain, item)),
		);
		for (const item of items) {
			if (domain !== "debtPeople")
				personEvidence.push({ ids: referencedPeople(item.data), sourceKey: recordKey(domain, item.localId) });
			const choice = await requestResult(
				tx.objectStore("application-upgrade").get(`owner:${domain}:${item.localId}`),
			);
			const owner: StorageOwner | undefined = explicitOwner(item.data) ?? choice?.ownerKey;
			if (!owner) continue;
			const key = recordKey(domain, item.localId);
			fixedOwners.set(key, owner);
			ownersByRecordId.set(key, new Set([owner]));
		}
	}

	// Accumulate all candidates to a fixed point, including conflicts discovered later.
	let changed = true;
	while (changed) {
		changed = false;
		for (const [domain, items] of records)
			for (const item of items) {
				const key = recordKey(domain, item.localId);
				if (fixedOwners.has(key) || !item.data || typeof item.data !== "object") continue;
				const candidates = ownersByRecordId.get(key) ?? new Set<StorageOwner>();
				const data = item.data as Record<string, unknown>;
				for (const [field, relatedDomain] of Object.entries(relationshipDomains)) {
					const id = data[field];
					if (typeof id !== "string") continue;
					for (const owner of ownersByRecordId.get(recordKey(relatedDomain, id)) ?? [])
						if (!candidates.has(owner)) {
							candidates.add(owner);
							changed = true;
						}
				}
				ownersByRecordId.set(key, candidates);
			}
		for (const evidence of personEvidence) {
			const sourceOwners = evidence.owner
				? [evidence.owner]
				: (ownersByRecordId.get(evidence.sourceKey ?? "") ?? []);
			for (const id of evidence.ids) {
				const key = recordKey("debtPeople", id);
				if (fixedOwners.has(key)) continue;
				const candidates = ownersByRecordId.get(key) ?? new Set<StorageOwner>();
				for (const owner of sourceOwners)
					if (!candidates.has(owner)) {
						candidates.add(owner);
						changed = true;
					}
				ownersByRecordId.set(key, candidates);
			}
		}
	}
	const ownerFor = (domain: StoreDomain, item: LegacyLocalData) => {
		const candidates = ownersByRecordId.get(recordKey(domain, item.localId));
		return candidates?.size === 1 ? [...candidates][0] : null;
	};
	return { ownerFor, records };
}

async function migrateLegacyData(database: IDBDatabase, tx: IDBTransaction): Promise<void> {
	const { records, ownerFor } = await resolveLegacyOwnership(database, tx);
	const preserved = new Set<string>();
	for (const [domain, items] of records)
		for (const item of items) if (!ownerFor(domain, item)) preserved.add(recordKey(domain, item.localId));

	// Keep dependent records together. An incomplete legacy graph must never enter sync.
	let changed = true;
	while (changed) {
		changed = false;
		for (const [domain, items] of records)
			for (const item of items) {
				const key = recordKey(domain, item.localId);
				if (preserved.has(key) || !item.data || typeof item.data !== "object") continue;
				const data = item.data as Record<string, unknown>;
				const references = Object.entries(relationshipDomains).flatMap(([field, relatedDomain]) =>
					typeof data[field] === "string" ? [recordKey(relatedDomain, data[field])] : [],
				);
				for (const id of referencedPeople(data)) references.push(recordKey("debtPeople", id));
				if (references.some(reference => preserved.has(reference))) {
					preserved.add(key);
					changed = true;
				}
			}
	}
	for (const [domain, items] of records)
		for (const item of items) {
			if (preserved.has(recordKey(domain, item.localId))) {
				const archiveId = `archive:${LEGACY_STORES[domain]}:${item.localId}`;
				const archive = await requestResult(tx.objectStore("application-upgrade").get(archiveId));
				await requestResult(
					tx.objectStore("application-upgrade").put({
						...archive,
						preservedReason: ownerFor(domain, item) ? "unresolved-reference" : "unresolved-owner",
					}),
				);
				continue;
			}
			const owner = ownerFor(domain, item)!;
			const store = tx.objectStore(scopedStoreName(domain));
			const key = scopedId(owner, item.localId);
			if (await requestResult(store.get(key))) continue;
			await requestResult(
				store.put({ ...item, modifiedAt: item.modifiedAt ?? 0, ownerKey: owner, scopedId: key }),
			);
		}
}

async function migrateCardPayments(_database: IDBDatabase, transaction: IDBTransaction): Promise<void> {
	const paymentsStore = transaction.objectStore(scopedStoreName("transactions"));
	const purchasesStore = transaction.objectStore(scopedStoreName("creditPurchases"));
	const [payments, statements, purchases] = await Promise.all([
		requestResult(paymentsStore.getAll()),
		requestResult(transaction.objectStore(scopedStoreName("creditCardStatements")).getAll()),
		requestResult(purchasesStore.getAll()),
	]);
	const migrated = migrateLegacyCardPayments(payments, statements);
	if (migrated.some(row => hasUnresolvedLegacyCardPayment(row.data)))
		throw new Error(
			"Pagamento antigo sem cartão identificado. Restaure a fatura de origem antes de continuar.",
		);
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
}

async function migrateRecurrences(_database: IDBDatabase, tx: IDBTransaction) {
	const domains = [
		"recurrences",
		"recurrenceOccurrences",
		"recurringPayments",
		"salaries",
		"subscriptions",
		"transactions",
		"creditBooks",
		"creditCards",
	] as const;

	const snapshots = await Promise.all(
		domains.map(domain => requestResult(tx.objectStore(scopedStoreName(domain)).getAll())),
	);
	try {
		const changes = migrateLocalRecurrenceRows(
			Object.fromEntries(domains.map((domain, index) => [domain, snapshots[index]])),
		);
		for (const [domain, rows] of Object.entries(changes))
			for (const row of rows) tx.objectStore(scopedStoreName(domain as StoreDomain)).put(row);
	} catch (error) {
		tx.abort();

		throw error;
	}
}
export async function migrateGuestLoanPayments(database: IDBDatabase, borrowed?: IDBTransaction) {
	const tx = borrowed ?? database.transaction(["scoped-loans", "scoped-loanPayments"], "readwrite");
	const done = borrowed ? undefined : transactionDone(tx);
	try {
		const loans = (await requestResult(tx.objectStore("scoped-loans").getAll())) as LocalData<Loan>[];
		const store = tx.objectStore("scoped-loanPayments");
		const payments = (await requestResult(store.getAll())) as LocalData<LoanPayment>[];
		for (const record of loans) {
			if (
				record.deleted ||
				!record.ownerKey.startsWith("guest:") ||
				payments.some(row => row.ownerKey === record.ownerKey && row.data.loanId === record.data.id)
			)
				continue;
			let schedule: ReturnType<typeof loanInstallments>;
			try {
				schedule = loanInstallments(record.data);
			} catch {
				tx.objectStore("scoped-loans").put({ ...record, data: { ...record.data, needsPaymentReview: true } });
				continue;
			}
			for (const row of schedule) {
				const id = crypto.randomUUID();
				store.put({
					data: { ...row, id, isAdvanced: false, loanId: record.data.id },
					localId: id,
					modifiedAt: record.modifiedAt,
					ownerKey: record.ownerKey,
					scopedId: scopedId(record.ownerKey, id),
				});
			}
			tx.objectStore("scoped-loans").put({
				...record,
				data: {
					...record.data,
					needsPaymentReview: (record.data.paidInstallments ?? 0) > 0,
					remainingInstallments: record.data.totalInstallments - (record.data.paidInstallments ?? 0),
				},
			});
		}
		await done;
	} catch (error) {
		tx.abort();
		await done?.catch(() => undefined);
		throw error;
	}
}

type LegacyFinancialAccount = FinancialAccount & {
	yieldRate?: number | null;
	yieldReferenceRate?: number | null;
	yieldRateHistories?: Array<
		import("../api").FinancialAccountYieldRateHistory & { yieldRate?: number | null }
	>;
};
type LegacyCreditCard = CreditCard & { cashbackYieldRate?: number | null };
type LegacyCreditPurchase = import("../api").CreditPurchase & {
	cashbackYieldRate?: number | null;
	categoryId?: string | null;
};

function withoutLegacyFinancialFields<T extends object>(value: T): T {
	const result = { ...value } as Record<string, unknown>;
	for (const key of [
		"yieldRate",
		"yieldReferenceRate",
		"cashbackYieldRate",
		"categoryId",
		"categoryName",
		"categoryColor",
	])
		delete result[key];
	return result as T;
}

async function migrateTagAssociations(tx: IDBTransaction) {
	const convert = (value: Record<string, unknown>) => ({
		...withoutLegacyFinancialFields(value),
		tagIds: [
			...new Set([
				...(Array.isArray(value.tagIds) ? value.tagIds : []),
				...(typeof value.categoryId === "string" ? [value.categoryId] : []),
			]),
		],
	});
	for (const name of ["scoped-transactions", "scoped-creditBooks"]) {
		const store = tx.objectStore(name);
		for (const row of await requestResult(store.getAll())) {
			const data =
				name === "scoped-creditBooks"
					? {
							...row.data,
							charges: row.data.charges.map(convert),
							purchases: row.data.purchases.map(convert),
						}
					: convert(row.data);
			await requestResult(store.put({ ...row, data }));
		}
	}
}

function normalizeLegacyCreditCard(card: LegacyCreditCard): CreditCard {
	const referenceRate = card.cashbackYieldReferenceRate ?? card.cashbackYieldRate;
	return {
		...withoutLegacyFinancialFields(card),
		cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage ?? (referenceRate ? 100 : null),
		cashbackYieldReferenceRate: referenceRate,
	};
}

function normalizeLegacyCreditPurchase(purchase: LegacyCreditPurchase): import("../api").CreditPurchase {
	const referenceRate = purchase.cashbackYieldReferenceRate ?? purchase.cashbackYieldRate;
	return {
		...withoutLegacyFinancialFields(purchase),
		cashbackYieldReferencePercentage:
			purchase.cashbackYieldReferencePercentage ?? (referenceRate ? 100 : null),
		cashbackYieldReferenceRate: referenceRate,
		tagIds: [...new Set([...(purchase.tagIds ?? []), ...(purchase.categoryId ? [purchase.categoryId] : [])])],
	};
}

function normalizeLegacyFinancialAccount(account: LegacyFinancialAccount): FinancialAccount {
	return {
		...withoutLegacyFinancialFields(account),
		...(account.creditCard && { creditCard: normalizeLegacyCreditCard(account.creditCard) }),
		yieldFixedRate: account.yieldFixedRate ?? account.yieldRate,
		yieldRateHistories: account.yieldRateHistories?.map(history => {
			const legacyHistory = history as import("../api").FinancialAccountYieldRateHistory & {
				yieldRate?: number | null;
				yieldReferenceRate?: number | null;
			};
			return {
				...withoutLegacyFinancialFields(history),
				yieldFixedRate: history.yieldFixedRate ?? legacyHistory.yieldRate,
				yieldReferenceType:
					history.yieldReferenceType ??
					(legacyHistory.yieldReferenceRate != null || history.yieldReferencePercentage != null
						? "CDI"
						: null),
			};
		}),
		yieldReferenceType:
			account.yieldReferenceType ??
			(account.yieldReferenceRate != null || account.yieldReferencePercentage != null ? "CDI" : null),
	};
}

/** A single transaction prevents half-converted owners and serializes competing tabs. */
export async function upgradeLocalDatabase(database: IDBDatabase) {
	const tx = database.transaction(Array.from(database.objectStoreNames), "readwrite");
	const done = transactionDone(tx);
	try {
		const stateStore = tx.objectStore("application-upgrade");
		const state = await requestResult(stateStore.get("state"));
		if (state?.status === "complete") {
			await done;
			return;
		}
		for (const name of Array.from(database.objectStoreNames).filter(name => name !== "application-upgrade")) {
			const rows = await requestResult(tx.objectStore(name).getAll());
			for (const row of rows) {
				const id = `archive:${name}:${row.scopedId ?? row.localId}`;
				if (!(await requestResult(stateStore.get(id))))
					await requestResult(stateStore.put({ id, original: row, store: name }));
			}
		}
		await migrateLegacyData(database, tx);
		await normalizeFinancialRows(tx);
		await migrateCardPayments(database, tx);
		await migrateCreditBooks(database, tx);
		await migrateRecurrences(database, tx);
		await migrateTagAssociations(tx);
		await extractRecurrenceProvenance(tx);
		await migrateDebts(tx);
		await migrateGuestLoanPayments(database, tx);
		// Archived originals remain recoverable; active sources must never be imported again.
		for (const name of Object.values(LEGACY_STORES))
			if (database.objectStoreNames.contains(name)) await requestResult(tx.objectStore(name).clear());
		await requestResult(stateStore.put({ id: "state", status: "complete", version: 13 }));
		await done;
	} catch (error) {
		try {
			tx.abort();
		} catch {}
		await done.catch(() => undefined);
		throw error;
	}
}
async function normalizeFinancialRows(tx: IDBTransaction) {
	for (const domain of ["accounts", "creditCards", "creditPurchases"] as const) {
		const store = tx.objectStore(scopedStoreName(domain));
		for (const row of await requestResult(store.getAll())) {
			const data =
				domain === "accounts"
					? normalizeLegacyFinancialAccount(row.data)
					: domain === "creditCards"
						? normalizeLegacyCreditCard(row.data)
						: normalizeLegacyCreditPurchase(row.data);
			if (JSON.stringify(data) !== JSON.stringify(row.data)) await requestResult(store.put({ ...row, data }));
		}
	}
}

async function extractRecurrenceProvenance(tx: IDBTransaction) {
	const store = tx.objectStore("scoped-recurrences");
	const state = tx.objectStore("application-upgrade");
	for (const row of await requestResult(store.getAll())) {
		const { legacySource, legacyId, ...data } = row.data;
		if (!legacySource || !legacyId) continue;
		const id = `mapping:${row.ownerKey}\u0000${legacySource}\u0000${legacyId}`;
		await requestResult(
			state.put({ id, legacyId, ownerKey: row.ownerKey, recurrenceId: data.id, source: legacySource }),
		);
		await requestResult(store.put({ ...row, data }));
	}
	for (const row of await requestResult(tx.objectStore("scoped-transactions").getAll()))
		if (row.data.salaryId || row.data.subscriptionId)
			throw new Error("Referência de recorrência não resolvida; originais preservados");
	// Sources remain in the recovery archive until a later schema upgrade removes empty stores.
	for (const name of ["scoped-salaries", "scoped-subscriptions", "scoped-recurringPayments"])
		await requestResult(tx.objectStore(name).clear());
}
