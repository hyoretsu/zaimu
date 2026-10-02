import { statementEntryKind } from "@zaimu/finance/credit-card";
import { loanInstallments } from "@zaimu/finance/loan";
import type { CreditCard, FinancialAccount, Loan, LoanPayment } from "../api";
import { requestResult, transactionDone } from "../idb";
import type { LocalData } from "../localStorage";
import type { CacheIdentity } from "../query-cache";
import { migrateLegacyCardPayments } from "./legacy-card-payments";
import { migrateCreditBooks } from "./migrate-credit-books";
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

async function migrateLegacyData(database: IDBDatabase, tx: IDBTransaction): Promise<void> {
	const legacyDomains = (Object.keys(LEGACY_STORES) as StoreDomain[]).filter(domain =>
		database.objectStoreNames.contains(LEGACY_STORES[domain]),
	);
	const records = new Map<StoreDomain, LegacyLocalData[]>();
	for (const domain of legacyDomains) {
		const transaction = tx;
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

	// Propagate ownership through several levels (account -> card -> statement -> purchase).
	for (let pass = 0; pass < records.size; pass++) {
		let changed = false;
		for (const items of records.values())
			for (const item of items) {
				if (ownersByRecordId.has(item.localId)) continue;
				const related = relatedOwners(item.data, ownersByRecordId);
				if (related.size === 1) {
					ownersByRecordId.set(item.localId, related);
					changed = true;
				}
			}
		if (!changed) break;
	}
	for (const [domain, items] of records) {
		const attributable = [];
		for (const item of items) {
			const directOwner = explicitOwner(item.data);
			const related = relatedOwners(item.data, ownersByRecordId);
			const choice = await requestResult(
				tx.objectStore("application-upgrade").get(`owner:${domain}:${item.localId}`),
			);
			const owner = directOwner ?? choice?.ownerKey ?? (related.size === 1 ? [...related][0] : null);
			if (!owner)
				throw new Error(
					`Proprietário ambíguo em ${domain}/${item.localId}. Revise dados locais antes de continuar.`,
				);
			attributable.push({ item, owner });
		}
		if (!attributable.length) continue;
		const store = tx.objectStore(scopedStoreName(domain));
		for (const { item, owner } of attributable) {
			const key = scopedId(owner, item.localId);
			if (await requestResult(store.get(key))) continue;
			await requestResult(
				store.put({ ...item, modifiedAt: item.modifiedAt ?? 0, ownerKey: owner, scopedId: key }),
			);
		}
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
	yieldRateHistories?: Array<
		import("../api").FinancialAccountYieldRateHistory & { yieldRate?: number | null }
	>;
};
type LegacyCreditCard = CreditCard & { cashbackYieldRate?: number | null };
type LegacyCreditPurchase = import("../api").CreditPurchase & { cashbackYieldRate?: number | null };

function normalizeLegacyCreditCard(card: LegacyCreditCard): CreditCard {
	const referenceRate = card.cashbackYieldReferenceRate ?? card.cashbackYieldRate;
	return {
		...card,
		cashbackYieldReferencePercentage: card.cashbackYieldReferencePercentage ?? (referenceRate ? 100 : null),
		cashbackYieldReferenceRate: referenceRate,
	};
}

function normalizeLegacyCreditPurchase(purchase: LegacyCreditPurchase): import("../api").CreditPurchase {
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
			const legacyHistory = history as import("../api").FinancialAccountYieldRateHistory & {
				yieldRate?: number | null;
			};
			return {
				...history,
				yieldFixedRate: history.yieldFixedRate ?? legacyHistory.yieldRate,
			};
		}),
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
		await extractRecurrenceProvenance(tx);
		await migrateGuestLoanPayments(database, tx);
		await requestResult(stateStore.put({ id: "state", status: "complete", version: 11 }));
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

/** Only an explicit review can assign an ambiguous historic record. */
export async function reviewLocalOwnership(
	database: IDBDatabase,
	assignments: Array<{ domain: StoreDomain; localId: string; ownerKey: StorageOwner }>,
) {
	const tx = database.transaction(
		["application-upgrade", ...assignments.map(a => LEGACY_STORES[a.domain])],
		"readwrite",
	);
	const done = transactionDone(tx);
	try {
		for (const choice of assignments) {
			if (!/^(user|guest):.+$/.test(choice.ownerKey)) throw new Error("Proprietário inválido");
			const row = await requestResult(tx.objectStore(LEGACY_STORES[choice.domain]).get(choice.localId));
			if (!row || explicitOwner(row.data)) throw new Error("Registro não disponível para atribuição");
			await requestResult(
				tx
					.objectStore("application-upgrade")
					.put({ id: `owner:${choice.domain}:${choice.localId}`, ownerKey: choice.ownerKey }),
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
