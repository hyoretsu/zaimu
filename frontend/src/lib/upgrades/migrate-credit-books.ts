import type { BookPurchase, CreditBook } from "@zaimu/finance/credit-book";
import { normalizeLegacyCreditPurchases } from "@zaimu/finance/legacy-credit-purchases";
import type { CreditCard, CreditCardStatement, CreditPurchase, FinancialAccount } from "../api";
import type { LocalData } from "../localStorage";

const request = <T>(value: IDBRequest<T>) =>
	new Promise<T>((resolve, reject) => {
		value.onsuccess = () => resolve(value.result);
		value.onerror = () => reject(value.error);
	});
const key = (owner: string, id: string) => `${owner}\u0000${id}`;

/** One atomic migration across every owner; archived sources preserve tombstones and clocks. */
export async function migrateCreditBooks(db: IDBDatabase, borrowed?: IDBTransaction) {
	const tx =
		borrowed ??
		db.transaction(
			[
				"scoped-creditBooks",
				"scoped-creditPurchases",
				"scoped-creditCards",
				"scoped-creditCardStatements",
				"scoped-accounts",
				"scoped-creditRefundReviews",
				"scoped-meta",
			],
			"readwrite",
		);
	const done = borrowed
		? undefined
		: new Promise<void>((resolve, reject) => {
				tx.oncomplete = () => resolve();
				tx.onabort = () => reject(tx.error ?? new Error("Migração financeira cancelada"));
				tx.onerror = () => reject(tx.error);
			});
	try {
		const [cards, statements, rows, accounts] = await Promise.all([
			request(tx.objectStore("scoped-creditCards").getAll()) as Promise<LocalData<CreditCard>[]>,
			request(tx.objectStore("scoped-creditCardStatements").getAll()) as Promise<
				LocalData<CreditCardStatement>[]
			>,
			request(tx.objectStore("scoped-creditPurchases").getAll()) as Promise<LocalData<CreditPurchase>[]>,
			request(tx.objectStore("scoped-accounts").getAll()) as Promise<LocalData<FinancialAccount>[]>,
		]);
		const owners = [...new Set([...cards, ...rows].map(row => row.ownerKey))];
		for (const row of rows.filter(row => !row.deleted)) {
			const statement = statements.find(
				s => s.ownerKey === row.ownerKey && s.data.id === row.data.statementId && !s.deleted,
			);
			if (
				!statement ||
				!cards.some(
					c => c.ownerKey === row.ownerKey && c.data.id === statement.data.creditCardId && !c.deleted,
				)
			)
				throw new Error("Compra legada sem cartão ou fatura válida. Originais preservados para correção.");
		}
		for (const owner of owners) {
			const marker = key(owner, "normalized-credit-books-v1");
			if (await request(tx.objectStore("scoped-meta").get(marker))) continue;
			for (const cardRow of cards.filter(row => row.ownerKey === owner && !row.deleted)) {
				const card = cardRow.data;
				const cardStatements = statements.filter(
					row => row.ownerKey === owner && row.data.creditCardId === card.id && !row.deleted,
				);
				const ids = new Set(cardStatements.map(row => row.data.id));
				const source = rows.filter(row => row.ownerKey === owner && ids.has(row.data.statementId));
				const existingBook = await request(tx.objectStore("scoped-creditBooks").get(key(owner, card.id)));
				if (existingBook) {
					if (source.length)
						throw new Error(
							"Livro normalizado e compras legadas coexistem. Originais preservados para revisão.",
						);
					continue;
				}
				const active = source.filter(
					row =>
						!row.deleted &&
						!(row.data.parentId && source.find(p => p.localId === row.data.parentId)?.deleted),
				);
				const migration = normalizeLegacyCreditPurchases(
					active.map(row => ({
						...row.data,
						categoryId: row.data.categoryId ?? null,
						creditCardId: card.id,
						purchaseDate: row.data.purchaseDate.slice(0, 10),
						storeName: row.data.storeName ?? null,
						tagIds: row.data.tagIds ?? [],
					})),
					cardStatements.map(row => ({
						id: row.data.id,
						statementDate: row.data.statementDate.slice(0, 10),
					})),
				);
				const account = accounts.find(
					row => row.ownerKey === owner && row.data.id === card.financialAccountId,
				)?.data;
				const book: CreditBook = {
					card: {
						dueDay: card.dueDay,
						id: card.id,
						ignoreStatementsBefore: card.ignoreStatementsBefore?.slice(0, 10) ?? null,
						institutionId: account?.institutionId ?? null,
						refundPolicy: null,
						statementDay: card.statementDay,
						userId: owner.split(":").slice(1).join(":"),
					},
					charges: migration.statementCharges.map(ch => ({
						...ch,
						amountCents: Math.round(ch.installmentAmount * 100),
						chargeDate: ch.purchaseDate.slice(0, 10),
						externalId:
							(
								active.find(row => row.localId === ch.id)?.data as
									| (CreditPurchase & { externalId?: string })
									| undefined
							)?.externalId ?? null,
						isSettled: active.find(row => row.localId === ch.id)?.data.isSettled ?? false,
						settledByPurchaseId: ch.settledByPurchaseId ?? null,
						time: active.find(row => row.localId === ch.id)?.data.time ?? null,
					})),
					deletedPurchaseIds: source
						.filter(
							row => row.deleted && !row.data.parentId && !row.data.isRefund && !row.data.isStatementCharge,
						)
						.map(row => row.localId),
					installments: migration.installments.map(i => ({
						...i,
						isSettled: active.find(row => row.localId === i.id)?.data.isSettled ?? false,
					})),
					payments: [],
					purchases: migration.purchases.map(p => {
						const original = active.find(row => row.localId === p.id)!.data;
						return {
							...p,
							cashbackAccountId: original.cashbackAccountId ?? null,
							cashbackAmount: original.cashbackAmount ?? null,
							cashbackYieldPeriod: original.cashbackYieldPeriod ?? null,
							cashbackYieldReferencePercentage: original.cashbackYieldReferencePercentage ?? null,
							cashbackYieldReferenceRate: original.cashbackYieldReferenceRate ?? null,
							createdAt:
								(original as CreditPurchase & { createdAt?: string }).createdAt ??
								new Date(cardRow.modifiedAt).toISOString(),
							debtSplitRule: original.debtSplit ?? null,
							externalId: (original as CreditPurchase & { externalId?: string }).externalId ?? null,
							feeAmount: original.feeAmount ?? null,
							feeDescription: original.feeDescription ?? null,
							installmentImportedNumbers: migration.installments
								.filter(i => i.purchaseId === p.id && i.hasImportedAmount)
								.map(i => i.number),
							installmentStatementDates: p.installmentAmountsCents.map((_, index) => {
								const i = migration.installments.find(i => i.purchaseId === p.id && i.number === index + 1);
								const s = i && cardStatements.find(row => row.data.id === i.statementId)?.data;
								return s
									? { dueDate: s.dueDate.slice(0, 10), statementDate: s.statementDate.slice(0, 10) }
									: null;
							}),
							recurrenceId:
								(original as CreditPurchase & { subscriptionId?: string }).subscriptionId ??
								original.recurrenceId ??
								null,
							recurrenceOccurrenceDate:
								(
									original as CreditPurchase & { subscriptionOccurrenceDate?: string }
								).subscriptionOccurrenceDate?.slice(0, 10) ??
								original.recurrenceOccurrenceDate?.slice(0, 10) ??
								null,
							refinancingFeeAmount: original.refinancingFeeAmount ?? null,
							time: original.time ?? null,
							updatedAt:
								(original as CreditPurchase & { updatedAt?: string }).updatedAt ??
								new Date(cardRow.modifiedAt).toISOString(),
							userId: owner.split(":").slice(1).join(":"),
						} as BookPurchase;
					}),
					refunds: migration.refunds.map(r => {
						const row = active.find(row => row.localId === r.id)!;
						return {
							...r,
							createdAt:
								(row.data as CreditPurchase & { createdAt?: string }).createdAt ??
								new Date(row.modifiedAt).toISOString(),
							deletedAt: null,
							externalId: (row.data as CreditPurchase & { externalId?: string }).externalId ?? null,
							time: row.data.time ?? null,
							updatedAt:
								(row.data as CreditPurchase & { updatedAt?: string }).updatedAt ??
								new Date(row.modifiedAt).toISOString(),
						};
					}),
					statements: cardStatements.map(row => ({
						...row.data,
						dueDate: row.data.dueDate.slice(0, 10),
						isFullySynced: row.data.isFullySynced ?? false,
						statementDate: row.data.statementDate.slice(0, 10),
					})),
				};
				for (const row of source.filter(
					row => row.deleted && row.data.isRefund && row.data.refundOfPurchaseId,
				)) {
					const p = book.purchases.find(p => p.id === row.data.refundOfPurchaseId);
					if (p)
						book.refunds.push({
							amountCents: Math.abs(Math.round(row.data.totalAmount * 100)),
							cancellationEligible: false,
							createdAt:
								(row.data as CreditPurchase & { createdAt?: string }).createdAt ??
								new Date(row.modifiedAt).toISOString(),
							creditDate: row.data.purchaseDate.slice(0, 10),
							creditStatementId: row.data.statementId,
							deletedAt: new Date(row.modifiedAt).toISOString(),
							id: row.localId,
							policy: "KEEP_INSTALLMENTS",
							purchaseId: p.id,
							updatedAt: new Date(row.modifiedAt).toISOString(),
						});
				}
				const modifiedAt = Math.max(cardRow.modifiedAt, ...source.map(row => row.modifiedAt));
				const syncedAt = [cardRow, ...cardStatements, ...source].every(
					row => row.syncedAt !== undefined && row.syncedAt >= row.modifiedAt,
				)
					? modifiedAt
					: undefined;
				await request(
					tx.objectStore("scoped-creditBooks").put({
						...cardRow,
						data: book,
						localId: card.id,
						modifiedAt,
						scopedId: key(owner, card.id),
						syncedAt,
					}),
				);
				for (const review of migration.unlinkedRefunds) {
					const row = source.find(row => row.localId === review.id)!;
					await request(
						tx.objectStore("scoped-creditRefundReviews").put({
							...row,
							data: { creditCardId: card.id, original: row.data, requiresRefundReview: true },
						}),
					);
				}
			}
			await request(
				tx.objectStore("scoped-meta").put({
					data: true,
					localId: "normalized-credit-books-v1",
					modifiedAt: Date.now(),
					ownerKey: owner,
					scopedId: marker,
				}),
			);
			// Remove active flattened source records. Archive source and clocks for migration audit.
			for (const row of rows.filter(row => row.ownerKey === owner)) {
				await request(
					tx.objectStore("scoped-meta").put({
						...row,
						localId: `credit-source-${row.localId}`,
						scopedId: key(owner, `credit-source-${row.localId}`),
					}),
				);
				await request(tx.objectStore("scoped-creditPurchases").delete(row.scopedId));
			}
		}
		await done;
	} catch (error) {
		try {
			tx.abort();
		} catch {}
		await done?.catch(() => undefined);
		throw error;
	}
}
