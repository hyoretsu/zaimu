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
	/** Explicit selection; undefined preserves legacy institution-policy refunds. */
	canceledInstallmentNumbers?: number[];
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
	return createRefundCalculator(invoices)(purchase, refunds, installments);
}

/** Validate a ledger's invoice dates once, retaining per-purchase financial checks. */
export function createRefundCalculator(invoices: readonly RefundInvoice[]) {
	const invoiceDates = new Map(invoices.map(invoice => [invoice.id, assertDateKey(invoice.statementDate)]));
	if (invoiceDates.size !== invoices.length) throw new RangeError("Fatura duplicada");
	return (
		purchase: Pick<CreditPurchase, "id" | "totalAmountCents">,
		refunds: readonly CreditRefund[],
		installments: readonly RefundInstallment[],
	): RefundEffect[] => calculateRefundEffectsWithInvoices(purchase, refunds, installments, invoiceDates);
}

function calculateRefundEffectsWithInvoices(
	purchase: Pick<CreditPurchase, "id" | "totalAmountCents">,
	refunds: readonly CreditRefund[],
	installments: readonly RefundInstallment[],
	invoiceDates: ReadonlyMap<string, string>,
): RefundEffect[] {
	assertCents(purchase.totalAmountCents, 1);
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
	const claimedNumbers = new Set<number>();
	return refunds.map(refund => {
		const cancel =
			refunds.length === 1 &&
			refund.cancellationEligible &&
			refund.policy === "CANCEL_FUTURE_INSTALLMENTS" &&
			refund.amountCents === purchase.totalAmountCents;
		const creditCycle = invoiceDates.get(refund.creditStatementId)!;
		const selected = refund.canceledInstallmentNumbers;
		if (
			selected &&
			(new Set(selected).size !== selected.length || selected.some(number => !numbers.has(number)))
		)
			throw new RangeError("Seleção de parcelas inválida");
		const canceled = selected
			? installments.filter(installment => selected.includes(installment.number))
			: cancel
				? installments.filter(
						installment =>
							!installment.isSettled &&
							invoiceDates.get(installment.statementId)! > creditCycle,
					)
				: [];
		for (const installment of canceled) {
			if (installment.isSettled || claimedNumbers.has(installment.number))
				throw new RangeError("Parcela já compensada ou reembolsada");
			claimedNumbers.add(installment.number);
		}
		const canceledAmountCents = sumCents(canceled.map(installment => installment.amountCents));
		if (canceledAmountCents > refund.amountCents)
			throw new RangeError("As parcelas selecionadas excedem o valor do reembolso");
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
		...(input.canceledInstallmentNumbers !== undefined && {
			canceledInstallmentNumbers: [...input.canceledInstallmentNumbers],
		}),
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
	changes: Partial<
		Pick<CreditRefund, "amountCents" | "creditDate" | "creditStatementId" | "canceledInstallmentNumbers">
	>,
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

/** Cancel complete installments in order; any amount left becomes invoice credit. */
export function selectRefundInstallments(
	installments: readonly RefundInstallment[],
	amountCents: number,
	from: "FIRST" | "LAST",
): number[] {
	assertCents(amountCents, 0);
	const ordered = installments
		.filter(installment => !installment.isSettled)
		.toSorted((a, b) => (from === "FIRST" ? a.number - b.number : b.number - a.number));
	let remaining = amountCents;
	const selected: number[] = [];
	for (const installment of ordered) {
		assertCents(installment.amountCents, 1);
		if (installment.amountCents > remaining) break;
		selected.push(installment.number);
		remaining -= installment.amountCents;
	}
	return selected.toSorted((a, b) => a - b);
}

/** A bank refund label without merchant data; never infer ordinary financial credits. */
export function isGenericImportedRefund(description: string) {
	return /^(?:(?:reembolso|estorno)\s*[-:]\s*)?(?:credito concedido|estorno|reembolso)$/u.test(
		description
			.normalize("NFD")
			.replace(/[\u0300-\u036f]/gu, "")
			.trim()
			.replace(/\s+/gu, " ")
			.toLowerCase(),
	);
}

/** Generic credits can suggest only a unique exact full purchase made by the credit date. */
export function matchingGenericRefundSource<
	T extends {
		purchaseDate: string;
		refundableAmount: number;
		totalAmount: number;
	},
>(item: { description: string; purchaseDate: string; installmentAmount: number }, sources: T[]) {
	if (!isGenericImportedRefund(item.description) || item.installmentAmount >= 0) return undefined;
	const cents = Math.round(Math.abs(item.installmentAmount) * 100);
	if (!Number.isSafeInteger(cents) || cents <= 0) return undefined;
	const matches = sources.filter(
		source =>
			Math.round(source.totalAmount * 100) === cents &&
			Math.round(source.refundableAmount * 100) >= cents &&
			source.purchaseDate.slice(0, 10) <= item.purchaseDate.slice(0, 10),
	);
	return matches.length === 1 ? matches[0] : undefined;
}

/** Shared import review tolerance, in the smallest currency unit (R$ 1.00 for BRL). */
export const importReconciliationToleranceCents = 100;

/** Match a nonempty consecutive interval in the original installment order. */
export function hasMatchingInstallmentSum(
	amounts: readonly number[],
	targetCents: number,
	toleranceCents = importReconciliationToleranceCents,
) {
	if (
		!Number.isSafeInteger(targetCents) ||
		targetCents <= 0 ||
		!Number.isSafeInteger(toleranceCents) ||
		toleranceCents < 0 ||
		amounts.some(amount => !Number.isSafeInteger(amount) || amount < 0)
	)
		return false;
	const lower = Math.max(1, targetCents - toleranceCents);
	const upper = targetCents + toleranceCents;
	if (!Number.isSafeInteger(upper)) return false;
	for (let start = 0; start < amounts.length; start++) {
		let sum = 0;
		for (let end = start; end < amounts.length; end++) {
			sum += amounts[end]!;
			if (sum > upper) break;
			if (sum >= lower) return true;
		}
	}
	return false;
}
