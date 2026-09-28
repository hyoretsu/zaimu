import { assertCents, assertDateKey, type CreditPurchase, sumCents } from "./credit-purchase";

export type RefundPolicy = "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS";

/** Restitution is positive; only invoice credit is subtracted from the invoice ledger. */
export interface CreditRefund {
	id: string;
	purchaseId: string;
	amountCents: number;
	creditDate: string;
	creditStatementId: string;
	/** Policy snapshot preserves past calculations if institution data changes. */
	policy: RefundPolicy;
	/** Set at creation only for the first single full refund; never promote a partial. */
	cancellationEligible: boolean;
}

export interface RefundInvoice {
	id: string;
	statementDate: string;
}

export interface RefundInstallment {
	number: number;
	amountCents: number;
	statementId: string;
	/** Refinanced installments are not canceled again. */
	isSettled?: boolean;
}

export interface RefundEffect {
	refundId: string;
	creditAmountCents: number;
	canceledAmountCents: number;
	canceledInstallmentNumbers: number[];
}

/** Must run inside the same purchase lock/IndexedDB transaction as the write. */
export function refundAmountCents(
	totalAmountCents: number,
	previousAmountsCents: readonly number[],
	requestedAmountCents?: number,
) {
	assertCents(totalAmountCents, 1);
	const refunded = sumCents(previousAmountsCents.map(amount => assertCents(amount, 1)));
	const remaining = totalAmountCents - refunded;
	const amount = requestedAmountCents ?? remaining;
	assertCents(amount, 1);
	if (amount > remaining) throw new RangeError("O reembolso excede o saldo disponível da compra");
	return amount;
}

/**
 * Partial refunds never prompt or cancel. Institution settings are write-once; a card
 * without an institution gets an operation snapshot, never a persisted fallback.
 */
export function resolveRefundPolicy(input: {
	institutionId: string | null;
	savedPolicy: RefundPolicy | null;
	requestedPolicy?: RefundPolicy;
	needsCancellationDecision: boolean;
}) {
	if (!input.needsCancellationDecision)
		return { policy: "KEEP_INSTALLMENTS" as RefundPolicy, saveInstitutionPolicy: false };
	if (input.institutionId && input.savedPolicy) {
		if (input.requestedPolicy && input.requestedPolicy !== input.savedPolicy)
			throw new RangeError("A política de reembolso da instituição não pode ser alterada");
		return { policy: input.savedPolicy, saveInstitutionPolicy: false };
	}
	if (!input.requestedPolicy) throw new RangeError("Informe a política de reembolso");
	return { policy: input.requestedPolicy, saveInstitutionPolicy: input.institutionId !== null };
}

/**
 * Recompute all effects from current data on every edit. Do not persist irreversible
 * cancellation flags on installment rows, and do not inspect invoice paid state.
 */
export function calculateRefundEffects(
	purchase: Pick<CreditPurchase, "id" | "totalAmountCents">,
	refunds: readonly CreditRefund[],
	installments: readonly RefundInstallment[],
	invoices: readonly RefundInvoice[],
): RefundEffect[] {
	assertCents(purchase.totalAmountCents, 1);
	const invoiceDates = new Map(invoices.map(invoice => [invoice.id, assertDateKey(invoice.statementDate)]));
	if (invoiceDates.size !== invoices.length) throw new RangeError("Fatura duplicada");
	const refundIds = new Set<string>();
	for (const refund of refunds) {
		if (refund.purchaseId !== purchase.id || !refund.id || refundIds.has(refund.id))
			throw new RangeError("Vínculo do reembolso inválido");
		refundIds.add(refund.id);
		assertCents(refund.amountCents, 1);
		assertDateKey(refund.creditDate);
		if (!invoiceDates.has(refund.creditStatementId))
			throw new RangeError("Fatura do reembolso não encontrada");
	}
	if (sumCents(refunds.map(refund => refund.amountCents)) > purchase.totalAmountCents)
		throw new RangeError("Os reembolsos excedem o total da compra");
	const numbers = new Set<number>();
	for (const installment of installments) {
		assertCents(installment.amountCents, 1);
		if (
			!Number.isSafeInteger(installment.number) ||
			installment.number < 1 ||
			numbers.has(installment.number)
		)
			throw new RangeError("Parcela duplicada ou inválida");
		numbers.add(installment.number);
		if (!invoiceDates.has(installment.statementId))
			throw new RangeError("Fatura da parcela não encontrada");
	}
	if (sumCents(installments.map(installment => installment.amountCents)) !== purchase.totalAmountCents)
		throw new RangeError("O cálculo exige o plano completo das parcelas");
	return refunds.map(refund => {
		const cancel =
			refunds.length === 1 &&
			refund.cancellationEligible &&
			refund.policy === "CANCEL_FUTURE_INSTALLMENTS" &&
			refund.amountCents === purchase.totalAmountCents;
		const creditCycle = invoiceDates.get(refund.creditStatementId)!;
		const canceled = cancel
			? installments.filter(
					installment =>
						!installment.isSettled && invoiceDates.get(installment.statementId)! > creditCycle,
				)
			: [];
		const canceledAmountCents = sumCents(canceled.map(installment => installment.amountCents));
		return {
			canceledAmountCents,
			canceledInstallmentNumbers: canceled
				.map(installment => installment.number)
				.toSorted((a, b) => a - b),
			creditAmountCents: refund.amountCents - canceledAmountCents,
			refundId: refund.id,
		};
	});
}

/** Caller excludes the edited refund from previousAmountsCents before validation. */
export function createCreditRefund(
	purchase: Pick<CreditPurchase, "id" | "totalAmountCents">,
	previousRefunds: readonly CreditRefund[],
	input: Omit<CreditRefund, "purchaseId" | "cancellationEligible" | "amountCents"> & {
		amountCents?: number;
		/** Includes deleted refunds, so deleting a partial does not erase its history. */
		hasPreviousRefundHistory: boolean;
	},
): CreditRefund {
	if (previousRefunds.some(refund => refund.purchaseId !== purchase.id || refund.id === input.id))
		throw new RangeError("Vínculo do reembolso inválido");
	const amountCents = refundAmountCents(
		purchase.totalAmountCents,
		previousRefunds.map(refund => refund.amountCents),
		input.amountCents,
	);
	assertDateKey(input.creditDate);
	if (!input.id || !input.creditStatementId) throw new RangeError("Reembolso inválido");
	return {
		amountCents,
		cancellationEligible:
			!input.hasPreviousRefundHistory &&
			!previousRefunds.length &&
			amountCents === purchase.totalAmountCents,
		creditDate: input.creditDate,
		creditStatementId: input.creditStatementId,
		id: input.id,
		policy: input.policy,
		purchaseId: purchase.id,
	};
}

export function editCreditRefund(
	purchase: Pick<CreditPurchase, "id" | "totalAmountCents">,
	refunds: readonly CreditRefund[],
	refundId: string,
	changes: Partial<Pick<CreditRefund, "amountCents" | "creditDate" | "creditStatementId">>,
) {
	const current = refunds.find(refund => refund.id === refundId && refund.purchaseId === purchase.id);
	if (!current || refunds.some(refund => refund.purchaseId !== purchase.id))
		throw new RangeError("Reembolso não encontrado");
	const edited = { ...current, ...changes };
	// Once a partial restitution exists, later edits cannot promote it to cancellation.
	edited.cancellationEligible =
		current.cancellationEligible && edited.amountCents === purchase.totalAmountCents;
	assertDateKey(edited.creditDate);
	refundAmountCents(
		purchase.totalAmountCents,
		refunds.filter(refund => refund.id !== refundId).map(refund => refund.amountCents),
		edited.amountCents,
	);
	if (!edited.creditStatementId) throw new RangeError("Fatura do reembolso não encontrada");
	return edited;
}
