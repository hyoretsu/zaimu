import { currencyScale } from "./money";
import { type CardPayment, calculateStatementBalances, type StatementInput } from "./credit-card";
import { assertCents, assertDateKey, assertPurchase, type CreditPurchase } from "./credit-purchase";
import { type CreditRefund, createRefundCalculator, type RefundInstallment } from "./credit-refund";

export interface PurchaseInvoiceInstallment extends RefundInstallment {
	purchaseId: string;
}

/**
 * Rebuild invoice purchase principal from normalized installments, not stored purchase
 * totals. Plan input includes forecasts; it does not persist future occurrences.
 * Charges remain separate and actual payments are replayed using registered due dates.
 */
export function rebuildPurchaseStatementLedger<T extends StatementInput>(input: {
	currency?: string;
	purchases: readonly CreditPurchase[];
	installments: readonly PurchaseInvoiceInstallment[];
	refunds: readonly CreditRefund[];
	statements: readonly T[];
	payments: readonly CardPayment[];
	asOf: string;
	ignoreBefore?: string | null;
}) {
	assertDateKey(input.asOf);
	const purchases = new Map(input.purchases.map(purchase => [purchase.id, assertPurchase(purchase)]));
	if (purchases.size !== input.purchases.length) throw new RangeError("Compra duplicada");
	const statementIds = new Set(input.statements.map(statement => statement.id));
	if (statementIds.size !== input.statements.length) throw new RangeError("Fatura duplicada");
	const invoiceTotals = new Map(input.statements.map(statement => [statement.id, 0]));
	const installmentsByPurchase = new Map<string, PurchaseInvoiceInstallment[]>();
	const refundsByPurchase = new Map<string, CreditRefund[]>();
	for (const installment of input.installments) {
		const purchase = purchases.get(installment.purchaseId);
		if (!purchase || !statementIds.has(installment.statementId))
			throw new RangeError("Vínculo da parcela inválido");
		const group = installmentsByPurchase.get(installment.purchaseId) ?? [];
		group.push(installment);
		installmentsByPurchase.set(installment.purchaseId, group);
		if (purchase.installmentAmountsCents[installment.number - 1] !== installment.amountCents)
			throw new RangeError("O valor da parcela não corresponde ao plano da compra");
	}
	for (const refund of input.refunds) {
		if (!purchases.has(refund.purchaseId)) throw new RangeError("Compra do reembolso não encontrada");
		if (refund.creditDate > input.asOf) continue;
		const group = refundsByPurchase.get(refund.purchaseId) ?? [];
		group.push(refund);
		refundsByPurchase.set(refund.purchaseId, group);
	}
	const invoices = input.statements.map(statement => ({
		id: statement.id,
		statementDate:
			typeof statement.statementDate === "string"
				? statement.statementDate.slice(0, 10)
				: statement.statementDate.toISOString().slice(0, 10),
	}));
	const calculateEffects = createRefundCalculator(invoices);
	const effects = [];
	for (const purchase of purchases.values()) {
		const installments = installmentsByPurchase.get(purchase.id) ?? [];
		const refunds = refundsByPurchase.get(purchase.id) ?? [];
		const purchaseEffects = calculateEffects(purchase, refunds, installments);
		effects.push(...purchaseEffects);
		const canceledNumbers = new Set(purchaseEffects.flatMap(effect => effect.canceledInstallmentNumbers));
		for (const installment of installments) {
			if (installment.isSettled || canceledNumbers.has(installment.number)) continue;
			assertCents(installment.amountCents, 1);
			const amount = (invoiceTotals.get(installment.statementId) ?? 0) + installment.amountCents;
			if (!Number.isSafeInteger(amount)) throw new RangeError("Total da fatura inválido");
			invoiceTotals.set(installment.statementId, amount);
		}
		const byId = new Map(purchaseEffects.map(effect => [effect.refundId, effect]));
		for (const refund of refunds) {
			const credit = byId.get(refund.id)!.creditAmountCents;
			// A negative total represents invoice credit. Validate signed sums separately.
			const amount = invoiceTotals.get(refund.creditStatementId)! - credit;
			if (!Number.isSafeInteger(amount)) throw new RangeError("Total da fatura inválido");
			invoiceTotals.set(refund.creditStatementId, amount);
		}
	}
	return {
		refundEffects: effects,
		statements: calculateStatementBalances(
			input.statements.map(statement => ({
				...statement,
				totalAmount: invoiceTotals.get(statement.id)! / currencyScale(input.currency),
			})),
			[...input.payments],
			input.asOf,
			input.ignoreBefore,
			input.currency,
		),
	};
}
