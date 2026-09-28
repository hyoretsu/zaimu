import {
	assertCents,
	assertDateKey,
	type CreditInstallment,
	type CreditPurchase,
	distributePurchaseCents,
	installmentOccurrenceDate,
	sumCents,
} from "./credit-purchase";
import type { CreditRefund } from "./credit-refund";

/** Input from the old flattened CreditPurchase table or owner-scoped IndexedDB store. */
export interface LegacyCreditPurchase {
	id: string;
	creditCardId: string;
	statementId: string;
	description: string;
	storeName: string | null;
	categoryId: string | null;
	tagIds: readonly string[];
	purchaseDate: string;
	totalAmount: number;
	installments: number;
	currentInstallment: number;
	installmentAmount: number;
	hasImportedAmount?: boolean;
	parentId?: string | null;
	refundOfPurchaseId?: string | null;
	isRefund?: boolean;
	isStatementCharge?: boolean;
	settledByPurchaseId?: string | null;
}

export interface LegacyStatement {
	id: string;
	statementDate: string;
}

export interface LegacyPurchaseMigration {
	purchases: CreditPurchase[];
	installments: CreditInstallment[];
	refunds: CreditRefund[];
	/** Imported credit with no source: stop and request linked-purchase review. */
	unlinkedRefunds: LegacyCreditPurchase[];
	/** Bank charges are not purchases and must be migrated to a charge ledger separately. */
	statementCharges: LegacyCreditPurchase[];
}

const cents = (amount: number) => {
	if (!Number.isFinite(amount)) throw new RangeError("Valor monetário inválido");
	return assertCents(Math.round(amount * 100), 1);
};

/**
 * Read-only, deterministic migration. Caller owns a single SQL/IndexedDB transaction,
 * copies all additional history/debt/import/reward references, then deletes old rows.
 * Never guesses a purchase for an unlinked negative bank entry.
 */
export function normalizeLegacyCreditPurchases(
	rows: readonly LegacyCreditPurchase[],
	statements: readonly LegacyStatement[],
): LegacyPurchaseMigration {
	const byId = new Map(rows.map(row => [row.id, row]));
	if (byId.size !== rows.length || rows.some(row => !row.id))
		throw new RangeError("ID de lançamento duplicado ou inválido");
	for (const row of rows) assertDateKey(row.purchaseDate);
	const statementDates = new Map(
		statements.map(statement => [statement.id, assertDateKey(statement.statementDate)]),
	);
	if (statementDates.size !== statements.length) throw new RangeError("Fatura duplicada");
	const purchases: CreditPurchase[] = [];
	const installments: CreditInstallment[] = [];
	const refunds: CreditRefund[] = [];
	const unlinkedRefunds: LegacyCreditPurchase[] = [];
	const statementCharges: LegacyCreditPurchase[] = [];
	for (const root of rows.filter(row => !row.parentId && !row.isRefund)) {
		const members = rows.filter(row => row.id === root.id || row.parentId === root.id);
		if (root.isStatementCharge) {
			statementCharges.push(...members);
			continue;
		}
		const knownAmounts = new Map<number, number>();
		const numbers = new Set<number>();
		for (const member of members) {
			if (member.isRefund || member.creditCardId !== root.creditCardId)
				throw new RangeError("Parcela vinculada incorretamente");
			if (
				!Number.isSafeInteger(member.currentInstallment) ||
				member.currentInstallment < 1 ||
				member.currentInstallment > root.installments ||
				numbers.has(member.currentInstallment)
			)
				throw new RangeError("Parcela duplicada ou inválida");
			numbers.add(member.currentInstallment);
			if (!statementDates.has(member.statementId))
				throw new RangeError("Fatura da parcela não encontrada");
			// Migration must not rewrite any historical amount, imported or manually edited.
			knownAmounts.set(member.currentInstallment, cents(member.installmentAmount));
		}
		const totalAmountCents = cents(root.totalAmount);
		const installmentAmountsCents = distributePurchaseCents(
			totalAmountCents,
			root.installments,
			knownAmounts,
		);
		const purchase: CreditPurchase = {
			categoryId: root.categoryId,
			creditCardId: root.creditCardId,
			description: root.description,
			id: root.id,
			installmentAmountsCents,
			purchaseDate: root.purchaseDate,
			storeName: root.storeName,
			tagIds: [...root.tagIds],
			totalAmountCents,
		};
		purchases.push(purchase);
		for (const member of members) {
			installments.push({
				amountCents: installmentAmountsCents[member.currentInstallment - 1]!,
				hasImportedAmount: Boolean(member.hasImportedAmount),
				id: member.id,
				number: member.currentInstallment,
				occurrenceDate: installmentOccurrenceDate(root.purchaseDate, member.currentInstallment),
				purchaseId: root.id,
				settledByPurchaseId: member.settledByPurchaseId ?? null,
				statementId: member.statementId,
			});
		}
	}
	for (const row of rows) {
		if (row.parentId) {
			const parent = byId.get(row.parentId);
			if (!parent || parent.parentId || parent.isRefund || parent.creditCardId !== row.creditCardId)
				throw new RangeError("Parcela sem compra original válida");
		}
		if (!row.isRefund) continue;
		const source = row.refundOfPurchaseId ? byId.get(row.refundOfPurchaseId) : undefined;
		const root = source?.parentId ? byId.get(source.parentId) : source;
		if (!root || root.isRefund || root.isStatementCharge) {
			unlinkedRefunds.push(row);
			continue;
		}
		if (root.creditCardId !== row.creditCardId)
			throw new RangeError("Reembolso vinculado a outro cartão");
		if (!statementDates.has(row.statementId)) throw new RangeError("Fatura do reembolso não encontrada");
		refunds.push({
			amountCents: cents(Math.abs(row.totalAmount)),
			cancellationEligible: false,
			creditDate: row.purchaseDate,
			creditStatementId: row.statementId,
			id: row.id,
			policy: "KEEP_INSTALLMENTS",
			purchaseId: root.id,
		});
	}
	for (const purchase of purchases) {
		if (
			sumCents(
				refunds.filter(refund => refund.purchaseId === purchase.id).map(refund => refund.amountCents),
			) > purchase.totalAmountCents
		)
			throw new RangeError("Reembolsos legados excedem o total da compra; revisão necessária");
	}
	return { installments, purchases, refunds, statementCharges, unlinkedRefunds };
}
