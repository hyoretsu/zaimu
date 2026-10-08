import { currentDateKey, recalculateStatementDueDate, statementCycles } from "./credit-card";
import {
	assertCents,
	assertDateKey,
	assertPurchase,
	type CreditInstallment,
	type CreditPurchase,
	distributePurchaseCents,
	installmentOccurrenceDate,
	purchaseStatementDates,
	sumCents,
} from "./credit-purchase";
import {
	type CreditRefund,
	createCreditRefund,
	createRefundCalculator,
	editCreditRefund,
	type RefundPolicy,
	resolveRefundPolicy,
} from "./credit-refund";
import { currencyScale, roundMoney, toMinorUnits } from "./money";
import { type PurchaseInvoiceInstallment, rebuildPurchaseStatementLedger } from "./purchase-statement-ledger";

export type PurchaseDebtRule =
	| {
			mode: "SHARES";
			ownerShares: number | null;
			participants: { debtPersonId: string; description?: string; shares: number }[];
	  }
	| {
			mode: "PERCENTAGE";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: { debtPersonId: string; description?: string; percentage: number }[];
	  }
	| {
			mode: "FIXED";
			ownerIncluded: boolean;
			remainderDebtPersonId?: string;
			participants: { debtPersonId: string; description?: string; fixedAmount: number }[];
	  };

export interface BookPurchase extends CreditPurchase {
	bookingCurrency?: string;
	currency?: string;
	originalAmount?: number | null;
	exchangeRate?: number | null;
	fees?: { name: string; amount: number; type: "FIXED" | "PERCENTAGE" }[];
	userId: string;
	time: string | null;
	feeAmount: number | null;
	feeDescription: string | null;
	refinancingFeeAmount: number | null;
	cashbackAccountId: string | null;
	cashbackAmount: number | null;
	cashbackCurrency?: string;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY" | null;
	cashbackYieldReferencePercentage: number | null;
	cashbackYieldReferenceRate: number | null;
	recurrenceId: string | null;
	recurrenceOccurrenceDate: string | null;
	externalId: string | null;
	debtSplitRule?: PurchaseDebtRule | null;
	createdAt: string;
	updatedAt: string;
	installmentStatementDates?: ({ statementDate: string; dueDate: string } | null)[];
	installmentImportedNumbers?: number[];
}

export interface BookRefund extends CreditRefund {
	externalId?: string | null;
	time?: string | null;
	deletedAt: string | null;
	createdAt: string;
	updatedAt: string;
}

export interface BookCharge {
	id: string;
	statementId: string;
	description: string;
	amountCents: number;
	chargeDate: string;
	time: string | null;
	externalId: string | null;
	isSettled: boolean;
	settledByPurchaseId: string | null;
}

export interface BookStatement {
	id: string;
	creditCardId: string;
	statementDate: string;
	dueDate: string;
	totalAmount: number;
	paidAmount: number;
	isPaid: boolean;
	isFullySynced: boolean;
	isForecast?: boolean;
}

export interface CreditBook {
	deletedPurchaseIds?: string[];
	deletedChargeIds?: string[];
	card: {
		currency?: string;
		id: string;
		userId: string;
		statementDay: number;
		dueDay: number;
		workingDueDate?: boolean;
		ignoreStatementsBefore: string | null;
		institutionId: string | null;
		refundPolicy: RefundPolicy | null;
	};
	purchases: BookPurchase[];
	installments: CreditInstallment[];
	refunds: BookRefund[];
	charges: BookCharge[];
	statements: BookStatement[];
	payments: { id: string; amount: number; date: string }[];
}

/** The only monetary conversion at the transport/database boundary. */
export function moneyCents(amount: number, minimum = 0, currency = "BRL") {
	return toMinorUnits(amount, currency, minimum);
}

export function bookPurchase(book: CreditBook, id: string) {
	const purchase = book.purchases.find(p => p.id === id);
	if (!purchase) throw new RangeError("Compra não encontrada");
	return purchase;
}

export function activePurchaseRefunds(book: CreditBook, purchaseId: string) {
	return book.refunds.filter(refund => refund.purchaseId === purchaseId && !refund.deletedAt);
}

/** Explicit principal edits retain the booked historical reward factor. */
export function resizePurchaseCashback(purchase: BookPurchase, previousTotal: number) {
	if (purchase.cashbackAmount == null || previousTotal === purchase.totalAmountCents) return;
	const amount = (purchase.cashbackAmount * purchase.totalAmountCents) / previousTotal;
	purchase.cashbackAmount = purchase.cashbackCurrency
		? roundMoney(amount, purchase.cashbackCurrency)
		: Number(amount.toFixed(4));
}

/** Reward reversals happen on the effective refund date, including canceled principal. */
export function creditBookRewards(book: CreditBook) {
	return book.purchases.flatMap(purchase => {
		if (!purchase.cashbackAccountId || !purchase.cashbackAmount) return [];
		const award = {
			cashbackAccountId: purchase.cashbackAccountId,
			cashbackAmount: purchase.cashbackAmount,
			cashbackYieldPeriod: purchase.cashbackYieldPeriod,
			cashbackYieldReferencePercentage: purchase.cashbackYieldReferencePercentage,
			cashbackYieldReferenceRate: purchase.cashbackYieldReferenceRate,
			currency: purchase.cashbackCurrency ?? book.card.currency ?? "BRL",
			purchaseDate: purchase.purchaseDate,
		};
		const rewardScale = purchase.cashbackCurrency ? currencyScale(purchase.cashbackCurrency) : 10000;
		let refunded = 0;
		return [
			award,
			...activePurchaseRefunds(book, purchase.id)
				.toSorted(
					(a, b) =>
						a.creditDate.localeCompare(b.creditDate) ||
						a.createdAt.localeCompare(b.createdAt) ||
						a.id.localeCompare(b.id),
				)
				.map(refund => {
					const before = Math.round(
						((purchase.cashbackAmount! * refunded) / purchase.totalAmountCents) * rewardScale,
					);
					refunded += refund.amountCents;
					const after = Math.round(
						((purchase.cashbackAmount! * refunded) / purchase.totalAmountCents) * rewardScale,
					);
					return {
						...award,
						cashbackAmount: -(after - before) / rewardScale,
						purchaseDate: refund.creditDate,
					};
				}),
		];
	});
}

/** One net consumption record per purchase; refund credits retain their effective date. */
export function creditBookConsumption(book: CreditBook) {
	const entries = creditBookEntries(book);
	const originals = creditBookEntries({ ...book, refunds: [] })
		.filter(entry => entry.currentInstallment === 1 && !entry.isRefund && !entry.isStatementCharge)
		.map(entry => {
			const refundedAmount =
				sumCents(activePurchaseRefunds(book, entry.purchaseId!).map(r => r.amountCents)) /
				currencyScale(book.card.currency);
			return {
				...entry,
				hasRefund: refundedAmount > 0,
				id: entry.purchaseId!,
				refundableAmount: entry.totalAmount - refundedAmount,
				refundedAmount,
				totalAmount: entry.totalAmount - refundedAmount,
			};
		});
	return [
		...originals,
		...entries
			.filter(entry => entry.isRefund || entry.isStatementCharge)
			.map(entry => (entry.isRefund ? { ...entry, totalAmount: entry.installmentAmount } : entry)),
	];
}

export function ensureBookStatement(
	book: CreditBook,
	date: string,
	registered?: { statementDate: string; dueDate: string },
) {
	assertDateKey(date);
	const dates = registered ?? purchaseStatementDates(book.card, date);
	const existing = registered
		? book.statements.find(statement => statement.statementDate === registered.statementDate)
		: book.statements
				.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate))
				.find(
					statement =>
						statement.statementDate > date &&
						statement.statementDate.slice(0, 7) === dates.statementDate.slice(0, 7),
				);
	if (existing) return existing;
	const statement: BookStatement = {
		...dates,
		creditCardId: book.card.id,
		id: crypto.randomUUID(),
		isFullySynced: false,
		isPaid: false,
		paidAmount: 0,
		totalAmount: 0,
	};
	book.statements.push(statement);
	return statement;
}

/** Complete invoice plan for calculations. Projections are never persisted as occurrences. */
export function creditBookPlan(book: CreditBook) {
	if (book.purchases.some(p => p.bookingCurrency && p.bookingCurrency !== (book.card.currency ?? "BRL")))
		throw new RangeError("Compra possui moeda contabilizada diferente do cartão");
	if (
		book.purchases.length &&
		![book.card.statementDay, book.card.dueDay].every(
			day => Number.isInteger(day) && day >= 1 && day <= 31,
		)
	)
		throw new RangeError("Calendário do cartão inválido");
	const statements = book.statements.map(statement => ({ ...statement }));
	const statementsById = new Map(statements.map(statement => [statement.id, statement]));
	const statementsByMonth = Map.groupBy(
		statements.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate)),
		statement => statement.statementDate.slice(0, 7),
	);
	const occurrences = new Map(book.installments.map(item => [`${item.purchaseId}:${item.number}`, item]));
	const installments: PurchaseInvoiceInstallment[] = [];
	for (const purchase of book.purchases) {
		assertPurchase(purchase);
		purchase.installmentAmountsCents.forEach((amountCents, index) => {
			const number = index + 1;
			const occurrence = occurrences.get(`${purchase.id}:${number}`);
			let statement = occurrence ? statementsById.get(occurrence.statementId) : undefined;
			if (occurrence && !statement) throw new RangeError("Fatura da parcela não encontrada");
			if (!occurrence) {
				const date = installmentOccurrenceDate(purchase.purchaseDate, number);
				const dates =
					purchase.installmentStatementDates?.[index] ?? purchaseStatementDates(book.card, date);
				statement = (statementsByMonth.get(dates.statementDate.slice(0, 7)) ?? []).find(
					item =>
						item.statementDate > date &&
						item.statementDate.slice(0, 7) === dates.statementDate.slice(0, 7),
				);
				if (!statement) {
					statement = {
						...dates,
						creditCardId: book.card.id,
						id: `forecast-${book.card.id}-${dates.statementDate}`,
						isForecast: true,
						isFullySynced: false,
						isPaid: false,
						paidAmount: 0,
						totalAmount: 0,
					};
					statements.push(statement);
					statementsById.set(statement.id, statement);
					const month = statement.statementDate.slice(0, 7);
					const group = statementsByMonth.get(month) ?? [];
					group.push(statement);
					group.sort((a, b) => a.statementDate.localeCompare(b.statementDate));
					statementsByMonth.set(month, group);
				}
			}
			if (!statement) throw new RangeError("Fatura da parcela não encontrada");
			installments.push({
				amountCents,
				isSettled: Boolean(occurrence?.isSettled || occurrence?.settledByPurchaseId),
				number,
				purchaseId: purchase.id,
				statementId: statement.id,
			});
		});
	}
	return { installments, statements };
}

export function creditBookEffects(book: CreditBook, asOf = currentDateKey(), plan = creditBookPlan(book)) {
	const calculate = createRefundCalculator(plan.statements);
	const installments = Map.groupBy(plan.installments, item => item.purchaseId);
	const refunds = Map.groupBy(
		book.refunds.filter(refund => !refund.deletedAt && refund.creditDate <= asOf),
		refund => refund.purchaseId,
	);
	return book.purchases.flatMap(purchase =>
		calculate(purchase, refunds.get(purchase.id) ?? [], installments.get(purchase.id) ?? []),
	);
}

export function materializeBookInstallments(book: CreditBook, asOf = currentDateKey()) {
	assertDateKey(asOf);
	const canceled = new Map<string, Set<number>>();
	const effects = creditBookEffects(book, asOf);
	for (const purchase of book.purchases) {
		const refundIds = new Set(activePurchaseRefunds(book, purchase.id).map(refund => refund.id));
		canceled.set(
			purchase.id,
			new Set(
				effects
					.filter(effect => refundIds.has(effect.refundId))
					.flatMap(effect => effect.canceledInstallmentNumbers),
			),
		);
		purchase.installmentAmountsCents.forEach((amountCents, index) => {
			const number = index + 1;
			const occurrenceDate = installmentOccurrenceDate(purchase.purchaseDate, number);
			if (
				occurrenceDate > asOf ||
				canceled.get(purchase.id)?.has(number) ||
				book.installments.some(item => item.purchaseId === purchase.id && item.number === number)
			)
				return;
			const statement = ensureBookStatement(
				book,
				occurrenceDate,
				purchase.installmentStatementDates?.[index] ?? undefined,
			);
			const id =
				number === 1 && !book.installments.some(item => item.id === purchase.id)
					? purchase.id
					: crypto.randomUUID();
			book.installments.push({
				amountCents,
				hasImportedAmount: purchase.installmentImportedNumbers?.includes(number) ?? false,
				id,
				number,
				occurrenceDate,
				purchaseId: purchase.id,
				settledByPurchaseId: null,
				statementId: statement.id,
			});
		});
	}
}

export function replayCreditBook(book: CreditBook, asOf = currentDateKey()) {
	const plan = creditBookPlan(book);
	const statements = statementCycles(
		plan.statements.map(statement => ({
			...statement,
			chargesAmount:
				sumCents(
					book.charges
						.filter(charge => charge.statementId === statement.id && !charge.isSettled)
						.map(charge => charge.amountCents),
				) / currencyScale(book.card.currency),
			dueDate: recalculateStatementDueDate(book.card, statement.statementDate, statement.dueDate),
		})),
		book.card,
		book.payments,
		dates => ({
			...dates,
			chargesAmount: 0,
			creditCardId: book.card.id,
			id: `forecast-${book.card.id}-${dates.statementDate}`,
			isForecast: true,
			isFullySynced: false,
			isPaid: false,
			paidAmount: 0,
			totalAmount: 0,
		}),
		asOf,
	);
	return rebuildPurchaseStatementLedger({
		asOf,
		currency: book.card.currency,
		ignoreBefore: book.card.ignoreStatementsBefore,
		installments: plan.installments,
		payments: book.payments,
		purchases: book.purchases,
		refunds: book.refunds.filter(refund => !refund.deletedAt),
		statements,
	});
}

export function addBookRefund(
	book: CreditBook,
	purchaseId: string,
	input: { amount?: number; creditDate: string; policy?: RefundPolicy; id?: string },
	now = new Date().toISOString(),
) {
	if (input.creditDate > currentDateKey())
		throw new RangeError("Restituição deve ter data efetiva até hoje");
	const purchase = bookPurchase(book, purchaseId);
	const history = book.refunds.filter(refund => refund.purchaseId === purchase.id);
	const previous = history.filter(refund => !refund.deletedAt);
	const statement = ensureBookStatement(book, input.creditDate);
	const amountCents =
		input.amount === undefined ? undefined : moneyCents(input.amount, 1, book.card.currency);
	const firstFull =
		!history.length && (amountCents ?? purchase.totalAmountCents) === purchase.totalAmountCents;
	const plan = creditBookPlan(book);
	const future = plan.installments.some(
		item =>
			item.purchaseId === purchase.id &&
			!item.isSettled &&
			plan.statements.find(s => s.id === item.statementId)!.statementDate > statement.statementDate,
	);
	const decision = resolveRefundPolicy({
		institutionId: book.card.institutionId,
		needsCancellationDecision: firstFull && future,
		requestedPolicy: input.policy,
		savedPolicy: book.card.refundPolicy,
	});
	const refund: BookRefund = {
		...createCreditRefund(purchase, previous, {
			amountCents,
			creditDate: input.creditDate,
			creditStatementId: statement.id,
			hasPreviousRefundHistory: history.length > 0,
			id: input.id ?? crypto.randomUUID(),
			policy: decision.policy,
		}),
		createdAt: now,
		deletedAt: null,
		updatedAt: now,
	};
	if (book.refunds.some(item => item.id === refund.id)) throw new RangeError("Reembolso duplicado");
	book.refunds.push(refund);
	if (decision.saveInstitutionPolicy) book.card.refundPolicy = decision.policy;
	replayCreditBook(book);
	return refund;
}

export function updateBookRefund(
	book: CreditBook,
	purchaseId: string,
	refundId: string,
	changes: { amount?: number; creditDate?: string },
	now = new Date().toISOString(),
) {
	if (changes.creditDate && changes.creditDate > currentDateKey())
		throw new RangeError("Restituição deve ter data efetiva até hoje");
	const purchase = bookPurchase(book, purchaseId);
	const previous = activePurchaseRefunds(book, purchaseId);
	const existing = previous.find(item => item.id === refundId);
	if (!existing) throw new RangeError("Reembolso não encontrado");
	const statement = changes.creditDate ? ensureBookStatement(book, changes.creditDate) : undefined;
	const edited = editCreditRefund(purchase, previous, refundId, {
		...(changes.amount !== undefined && {
			amountCents: moneyCents(changes.amount, 1, book.card.currency),
		}),
		...(changes.creditDate && { creditDate: changes.creditDate, creditStatementId: statement!.id }),
	});
	Object.assign(existing, edited, { updatedAt: now });
	replayCreditBook(book);
	return existing;
}

export function removeBookRefund(
	book: CreditBook,
	purchaseId: string,
	refundId: string,
	now = new Date().toISOString(),
) {
	const refund = activePurchaseRefunds(book, purchaseId).find(item => item.id === refundId);
	if (!refund) throw new RangeError("Reembolso não encontrado");
	refund.deletedAt = now;
	refund.updatedAt = now;
	replayCreditBook(book);
}

export function newBookPurchase(
	book: CreditBook,
	input: Pick<BookPurchase, "description" | "purchaseDate"> &
		Partial<BookPurchase> & { totalAmount: number; installments: number },
	now = new Date().toISOString(),
	options: { materialize?: boolean } = {},
) {
	const { totalAmount, installments, ...metadata } = input;
	const purchase: BookPurchase = {
		cashbackAccountId: null,
		cashbackAmount: null,
		cashbackYieldPeriod: null,
		cashbackYieldReferencePercentage: null,
		cashbackYieldReferenceRate: null,
		debtSplitRule: null,
		externalId: null,
		feeAmount: null,
		feeDescription: null,
		recurrenceId: null,
		recurrenceOccurrenceDate: null,
		refinancingFeeAmount: null,
		storeName: null,
		tagIds: [],
		time: null,
		...metadata,
		bookingCurrency: book.card.currency ?? "BRL",
		createdAt: now,
		creditCardId: book.card.id,
		id: input.id ?? crypto.randomUUID(),
		installmentAmountsCents:
			input.installmentAmountsCents ??
			distributePurchaseCents(moneyCents(totalAmount, 1, book.card.currency), installments),
		totalAmountCents: moneyCents(totalAmount, 1, book.card.currency),
		updatedAt: now,
		userId: book.card.userId,
	};
	assertPurchase(purchase);
	if (book.purchases.some(item => item.id === purchase.id)) throw new RangeError("Compra duplicada");
	book.purchases.push(purchase);
	if (options.materialize !== false) materializeBookInstallments(book);
	return purchase;
}

/** Cumulative allocation keeps several tiny refunds within each person's original share. */
export function refundDebtAmounts(
	totalCents: number,
	participantCents: readonly number[],
	beforeCents: number,
	refundCents: number,
) {
	assertCents(totalCents, 1);
	assertCents(beforeCents);
	assertCents(refundCents);
	if (beforeCents + refundCents > totalCents || sumCents(participantCents) > totalCents)
		throw new RangeError("Rateio do reembolso inválido");
	return participantCents.map(amount => {
		assertCents(amount);
		return (
			Math.floor((amount * (beforeCents + refundCents)) / totalCents) -
			Math.floor((amount * beforeCents) / totalCents)
		);
	});
}

/** Invoice presentation only. These rows are never saved as duplicated purchases. */
export function creditBookEntries(book: CreditBook, includeForecasts = true) {
	const plan = creditBookPlan(book);
	const effects = creditBookEffects(book, currentDateKey(), plan);
	const refundsByPurchase = Map.groupBy(
		book.refunds.filter(refund => !refund.deletedAt),
		refund => refund.purchaseId,
	);
	const installmentsByPurchase = Map.groupBy(plan.installments, item => item.purchaseId);
	const concreteByPurchase = Map.groupBy(book.installments, item => item.purchaseId);
	const concreteByNumber = new Map(
		book.installments.map(item => [`${item.purchaseId}:${item.number}`, item]),
	);
	const purchasesById = new Map(book.purchases.map(purchase => [purchase.id, purchase]));
	const byRefund = new Map(effects.map(effect => [effect.refundId, effect]));
	const entries = book.purchases.flatMap(purchase => {
		const refunds = (refundsByPurchase.get(purchase.id) ?? []).map(refund => ({
			amount: refund.amountCents / currencyScale(book.card.currency),
			canceledAmount: byRefund.get(refund.id)!.canceledAmountCents / currencyScale(book.card.currency),
			creditAmount: byRefund.get(refund.id)!.creditAmountCents / currencyScale(book.card.currency),
			date: refund.creditDate,
			id: refund.id,
			policy: refund.policy,
		}));
		const refundedAmount =
			sumCents((refundsByPurchase.get(purchase.id) ?? []).map(refund => refund.amountCents)) /
			currencyScale(book.card.currency);
		const canceled = new Set(
			refunds
				.map(refund => byRefund.get(refund.id)!)
				.flatMap(effect => effect.canceledInstallmentNumbers),
		);
		return (installmentsByPurchase.get(purchase.id) ?? []).flatMap(item => {
			const concrete = concreteByNumber.get(`${purchase.id}:${item.number}`);
			if ((!concrete && !includeForecasts) || canceled.has(item.number)) return [];
			return [
				{
					...purchase,
					currentInstallment: item.number,
					entryKind: "INSTALLMENT" as const,
					hasImportedAmount: concrete?.hasImportedAmount ?? false,
					hasRefund: refunds.length > 0,
					id: concrete?.id ?? `forecast-${purchase.id}-${item.number}`,
					installmentAmount: item.amountCents / currencyScale(book.card.currency),
					installments: purchase.installmentAmountsCents.length,
					isForecast: !concrete,
					isFullySynced:
						(concreteByPurchase.get(purchase.id) ?? []).length ===
							purchase.installmentAmountsCents.length &&
						(concreteByPurchase.get(purchase.id) ?? []).every(row => row.hasImportedAmount),
					isRefund: false,
					isSettled: Boolean(concrete?.isSettled || concrete?.settledByPurchaseId),
					isStatementCharge: false,
					isSynced: concrete?.hasImportedAmount ?? false,
					occurrenceDate: installmentOccurrenceDate(purchase.purchaseDate, item.number),
					parentId: item.number === 1 ? undefined : purchase.id,
					purchaseId: purchase.id,
					refund: refunds.length === 1 ? refunds[0] : undefined,
					refundableAmount:
						purchase.totalAmountCents / currencyScale(book.card.currency) - refundedAmount,
					refundedAmount,
					refundOfPurchaseId: null as string | null,
					refunds,
					settledByPurchaseId: concrete?.settledByPurchaseId ?? null,
					statementId: item.statementId,
					totalAmount: purchase.totalAmountCents / currencyScale(book.card.currency),
				},
			];
		});
	});
	const refunds = book.refunds
		.filter(refund => !refund.deletedAt)
		.map(refund => {
			const purchase = purchasesById.get(refund.purchaseId);
			if (!purchase) throw new RangeError("Compra não encontrada");
			return {
				...purchase,
				createdAt: refund.createdAt,
				currentInstallment: 1,
				entryKind: "REFUND" as const,
				hasImportedAmount: false,
				hasRefund: false,
				id: refund.id,
				installmentAmount:
					-byRefund.get(refund.id)!.creditAmountCents / currencyScale(book.card.currency),
				installments: 1,
				isForecast: false,
				isFullySynced: false,
				isRefund: true,
				isSettled: false,
				isStatementCharge: false,
				isSynced: false,
				occurrenceDate: refund.creditDate,
				originalPurchaseDate: purchase.purchaseDate,
				parentId: undefined,
				purchaseDate: refund.creditDate,
				purchaseId: purchase.id,
				refund: {
					amount: refund.amountCents / currencyScale(book.card.currency),
					canceledAmount:
						byRefund.get(refund.id)!.canceledAmountCents / currencyScale(book.card.currency),
					creditAmount:
						byRefund.get(refund.id)!.creditAmountCents / currencyScale(book.card.currency),
					date: refund.creditDate,
					id: refund.id,
					policy: refund.policy,
				},
				refundableAmount: 0,
				refundedAmount: 0,
				refundOfPurchaseId: purchase.id,
				refunds: [],
				settledByPurchaseId: null,
				statementId: refund.creditStatementId,
				totalAmount: -refund.amountCents / currencyScale(book.card.currency),
				updatedAt: refund.updatedAt,
			};
		});
	const charges = book.charges.map(charge => ({
		currentInstallment: 1,
		description: charge.description,
		entryKind: "CHARGE" as const,
		hasImportedAmount: Boolean(charge.externalId),
		hasRefund: false,
		id: charge.id,
		installmentAmount: charge.amountCents / currencyScale(book.card.currency),
		installments: 1,
		isForecast: false,
		isFullySynced: Boolean(charge.externalId),
		isRefund: false,
		isSettled: charge.isSettled,
		isStatementCharge: true,
		isSynced: Boolean(charge.externalId),
		occurrenceDate: charge.chargeDate,
		parentId: undefined,
		purchaseDate: charge.chargeDate,
		purchaseId: null,
		refund: undefined,
		refundableAmount: 0,
		refundedAmount: 0,
		refundOfPurchaseId: null,
		refunds: [],
		settledByPurchaseId: charge.settledByPurchaseId,
		statementId: charge.statementId,
		storeName: null,
		tagIds: [],
		time: charge.time,
		totalAmount: charge.amountCents / currencyScale(book.card.currency),
	}));
	return [...entries, ...refunds, ...charges].map(entry => ({
		...entry,
		bookingCurrency: book.card.currency ?? "BRL",
	}));
}

/** Explicit historical recomposition preserves occurrence IDs and imported calendars. */
export function updateBookPurchaseDate(book: CreditBook, purchaseId: string, purchaseDate: string) {
	assertDateKey(purchaseDate);
	const purchase = bookPurchase(book, purchaseId);
	purchase.purchaseDate = purchaseDate;
	purchase.installmentStatementDates = purchase.installmentAmountsCents.map((_, index) =>
		purchase.installmentImportedNumbers?.includes(index + 1)
			? (purchase.installmentStatementDates?.[index] ?? null)
			: null,
	);
	for (const installment of book.installments.filter(i => i.purchaseId === purchaseId)) {
		installment.occurrenceDate = installmentOccurrenceDate(purchaseDate, installment.number);
		installment.statementId = ensureBookStatement(
			book,
			installment.occurrenceDate,
			purchase.installmentStatementDates[installment.number - 1] ?? undefined,
		).id;
	}
}

/** Move a manual purchase with its concrete installments and refunds between card ledgers. */
export function moveBookPurchase(source: CreditBook, destination: CreditBook, purchaseId: string) {
	if ((source.card.currency ?? "BRL") !== (destination.card.currency ?? "BRL"))
		throw new RangeError("Transferência de compra exige cartões com a mesma moeda contabilizada");
	const rootId = source.installments.find(item => item.id === purchaseId)?.purchaseId ?? purchaseId;
	const purchase = bookPurchase(source, rootId);
	const installments = source.installments.filter(item => item.purchaseId === rootId);
	const refunds = source.refunds.filter(item => item.purchaseId === rootId);
	if (
		purchase.externalId ||
		purchase.installmentImportedNumbers?.length ||
		installments.some(item => item.hasImportedAmount) ||
		refunds.some(item => item.externalId)
	)
		throw new RangeError("Compras sincronizadas não podem mudar de cartão");
	if (source.card.userId !== destination.card.userId)
		throw new RangeError("Cartões pertencem a usuários diferentes");
	source.purchases = source.purchases.filter(item => item.id !== rootId);
	source.installments = source.installments.filter(item => item.purchaseId !== rootId);
	source.refunds = source.refunds.filter(item => item.purchaseId !== rootId);
	purchase.creditCardId = destination.card.id;
	purchase.installmentStatementDates = purchase.installmentAmountsCents.map(() => null);
	destination.purchases.push(purchase);
	for (const installment of installments) {
		installment.statementId = ensureBookStatement(destination, installment.occurrenceDate).id;
		destination.installments.push(installment);
	}
	for (const refund of refunds) {
		refund.creditStatementId = ensureBookStatement(destination, refund.creditDate).id;
		destination.refunds.push(refund);
	}
	return purchase;
}

export function refinanceBookPurchase(
	book: CreditBook,
	purchaseId: string,
	input: { feeAmount: number; installments: number; purchaseDate: string },
) {
	const source = bookPurchase(book, purchaseId);
	const ledger = replayCreditBook(book).statements;
	const activeIds = new Set(
		creditBookEntries(book, false)
			.filter(row => !row.isRefund && !row.isStatementCharge)
			.map(row => row.id),
	);
	const selected = book.installments.filter(
		i =>
			i.purchaseId === source.id &&
			activeIds.has(i.id) &&
			!i.isSettled &&
			!i.settledByPurchaseId &&
			!ledger.find(s => s.id === i.statementId)?.isPaid,
	);
	if (!selected.length) throw new RangeError("Não há parcelas disponíveis");
	const settledCents = sumCents(selected.map(i => i.amountCents));
	const totalAmount =
		(settledCents + moneyCents(input.feeAmount, 0, book.card.currency)) /
		currencyScale(book.card.currency);
	const purchase = newBookPurchase(book, {
		description: `Parcelamento - ${source.description}`,
		installments: input.installments,
		purchaseDate: input.purchaseDate,
		refinancingFeeAmount: input.feeAmount,
		storeName: source.storeName,
		tagIds: source.tagIds,
		totalAmount,
	});
	for (const installment of selected) {
		installment.isSettled = true;
		installment.settledByPurchaseId = purchase.id;
	}
	return { settledAmount: settledCents / currencyScale(book.card.currency), totalAmount };
}
