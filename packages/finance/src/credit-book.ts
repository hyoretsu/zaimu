import { assertBookPurchaseCanMove, bookRefinancingLinks } from "./credit-book-refinancing";

export {
	bookRefinancingLinks,
	removeBookPurchase,
	synchronizeBookRefinancing,
} from "./credit-book-refinancing";

import {
	assertCalendarPeriod,
	calendarCycles,
	type CardCalendarPeriod,
	currentDateKey,
	paymentStatementDates,
	statementCycles,
	toCents,
} from "./credit-card";
import {
	assertCents,
	assertDateKey,
	assertPurchase,
	type CreditInstallment,
	type CreditPurchase,
	distributePurchaseCents,
	installmentOccurrenceDate,
	purchaseStatementDates,
	statementIncludesDate,
	sumCents,
} from "./credit-purchase";
import {
	createCreditRefund,
	createRefundCalculator,
	type CreditRefund,
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
	manualTotalAmount?: number | null;
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
		calendarHistory?: CardCalendarPeriod[] | null;
		currency?: string;
		id: string;
		userId: string;
		statementDay: number;
		statementClosingInclusive?: boolean;
		dueDay: number;
		workingDueDate?: boolean;
		ignoreStatementsBefore: string | null;
		institutionId: string | null;
		installmentRemainderOnFirst?: boolean;
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

export function resolveBookInstallment(book: CreditBook, id: string) {
	const concrete = book.installments.find(item => item.id === id);
	if (concrete) return concrete;
	for (const purchase of book.purchases) {
		const index = purchase.installmentAmountsCents.findIndex(
			(_, index) => id === `forecast-${purchase.id}-${index + 1}`,
		);
		if (index !== -1) return { number: index + 1, purchaseId: purchase.id };
	}
	return undefined;
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
					refunded = Math.min(purchase.totalAmountCents, refunded + refund.amountCents);
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

/** Resolve actual cutoffs before falling back to the card's nominal calendar. */
function purchaseBookStatementDates(book: CreditBook, date: string) {
	if (book.card.calendarHistory?.length) {
		const end = `${Number(date.slice(0, 4)) + 2}-12-31`;
		const cycles = new Map(calendarCycles(book.card, date, end).map(item => [item.statementDate, item]));
		for (const statement of book.statements)
			if (!statement.isForecast) cycles.set(statement.statementDate, statement);
		const next = [...cycles.values()]
			.sort((a, b) => a.statementDate.localeCompare(b.statementDate))
			.find(item => statementIncludesDate(book.card, item.statementDate, date));
		if (next) return { dueDate: next.dueDate, statementDate: next.statementDate };
	}

	for (let offset = 0; ; offset++) {
		const month = installmentOccurrenceDate(date, offset + 1).slice(0, 7);
		const cycles = book.statements
			.filter(statement => statement.statementDate.slice(0, 7) === month)
			.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate));
		const existing = cycles.find(statement =>
			statementIncludesDate(book.card, statement.statementDate, date),
		);
		if (existing) return { dueDate: existing.dueDate, statementDate: existing.statementDate };
		if (cycles.length) continue;
		const nominal = purchaseStatementDates(book.card, `${month}-01`);
		if (statementIncludesDate(book.card, nominal.statementDate, date)) return nominal;
	}
}

/** Bank dates correct an existing cycle without replacing its identity or imported links. */
export function synchronizeImportedStatementDates(
	book: CreditBook,
	dates: { statementDate: string; dueDate: string },
	statementId?: string | null,
) {
	assertDateKey(dates.statementDate);
	assertDateKey(dates.dueDate);
	if (dates.dueDate < dates.statementDate)
		throw new RangeError("Vencimento deve ser igual ou posterior ao fechamento");
	const candidates = book.statements.filter(statement => !statement.isForecast);
	const statement = statementId
		? candidates.find(item => item.id === statementId)
		: (candidates.find(item => item.statementDate === dates.statementDate) ??
			candidates.find(item => item.dueDate === dates.dueDate));
	if (statementId && !statement) throw new RangeError("Fatura não encontrada");
	if (!statement) return ensureBookStatement(book, dates.statementDate, dates);
	updateBookStatementDates(book, statement.id, dates);
	return statement;
}

/** Explicit installment calendars identify cycles independently of the purchase cutoff. */
function registeredBookStatement(
	statements: BookStatement[],
	dates: { statementDate: string; dueDate: string },
) {
	return (
		statements.find(statement => statement.statementDate === dates.statementDate) ??
		statements.find(statement => statement.dueDate === dates.dueDate)
	);
}

export function ensureBookStatement(
	book: CreditBook,
	date: string,
	registered?: { statementDate: string; dueDate: string },
) {
	assertDateKey(date);
	const dates = registered ?? purchaseBookStatementDates(book, date);
	const existing = registered
		? registeredBookStatement(book.statements, registered)
		: book.statements
				.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate))
				.find(
					statement =>
						statementIncludesDate(book.card, statement.statementDate, date) &&
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

/** Confirmed installments anchor later forecasts, independent of calendar months. */
function installmentBookDates(book: CreditBook, purchase: BookPurchase, index: number) {
	const explicit = purchase.installmentStatementDates?.[index];
	if (explicit) return explicit;
	let anchorIndex = 0;
	let anchor =
		purchase.installmentStatementDates?.[0] ?? purchaseBookStatementDates(book, purchase.purchaseDate);
	for (let i = 0; i < index; i++) {
		const occurrence = book.installments.find(
			item => item.purchaseId === purchase.id && item.number === i + 1,
		);
		const known =
			purchase.installmentStatementDates?.[i] ??
			(occurrence && book.statements.find(item => item.id === occurrence.statementId));
		if (known) {
			anchorIndex = i;
			anchor = known;
		}
	}
	if (index === anchorIndex) return anchor;
	const end = `${Number(anchor.statementDate.slice(0, 4)) + Math.ceil(purchase.installmentAmountsCents.length / 12) + 2}-12-31`;
	const configured = calendarCycles(book.card, anchor.statementDate, end);
	const cycles = new Map(configured.map(item => [item.statementDate, item]));
	// Actual bank cutoffs replace nominal cutoffs in unconfigured historical months.
	for (const statement of book.statements.filter(item => !item.isForecast)) {
		if (!book.card.calendarHistory?.length)
			for (const key of cycles.keys())
				if (key.slice(0, 7) === statement.statementDate.slice(0, 7)) cycles.delete(key);
	}
	for (const statement of book.statements.filter(item => !item.isForecast))
		cycles.set(statement.statementDate, statement);
	let current = anchor;
	for (let i = anchorIndex + 1; i <= index; i++) {
		const ordered = [...cycles.values()]
			.filter(item => item.statementDate > current.statementDate)
			.sort((a, b) => a.statementDate.localeCompare(b.statementDate));
		const next = ordered.find(item => {
			const period = book.card.calendarHistory
				?.filter(p => p.firstStatementDate <= item.statementDate)
				.toSorted((a, b) => a.firstStatementDate.localeCompare(b.firstStatementDate))
				.at(-1);
			return (
				period?.installmentMode === "PER_CYCLE" ||
				item.dueDate.slice(0, 7) > current.dueDate.slice(0, 7)
			);
		});
		if (!next)
			return purchaseBookStatementDates(
				book,
				installmentOccurrenceDate(purchase.purchaseDate, index + 1),
			);
		current = next;
	}
	return { dueDate: current.dueDate, statementDate: current.statementDate };
}

/** Record a transition once, preserving confirmed history and imported assignments. */
export function changeBookCalendar(
	book: CreditBook,
	previous: Pick<CreditBook["card"], "statementDay" | "dueDay" | "workingDueDate">,
	period: CardCalendarPeriod,
) {
	assertCalendarPeriod(period);
	const history = book.card.calendarHistory ?? [];
	const latest = history.at(-1);
	if (
		latest &&
		(period.effectiveDate <= latest.effectiveDate ||
			period.firstStatementDate <= latest.firstStatementDate)
	)
		throw new RangeError("Nova alteração deve ser posterior ao calendário registrado");
	if (history.some(item => item.effectiveDate === period.effectiveDate))
		throw new RangeError("Já existe alteração nesta data");
	if (!history.length)
		history.push({
			dueDay: previous.dueDay,
			effectiveDate: "0001-01-01",
			firstDueDate: "0001-01-01",
			firstStatementDate: "0001-01-01",
			installmentMode: "PER_MONTH",
			statementDay: previous.statementDay,
			transitionMode: "NEXT_CYCLE",
			workingDueDate: previous.workingDueDate ?? false,
		});
	book.card.calendarHistory = [...history, period].sort((a, b) =>
		a.effectiveDate.localeCompare(b.effectiveDate),
	);
	Object.assign(book.card, { dueDay: period.dueDay, statementDay: period.statementDay });
	const retired = new Set(
		book.statements
			.filter(
				item =>
					item.statementDate >= period.firstStatementDate &&
					!item.isFullySynced &&
					item.manualTotalAmount == null &&
					!book.charges.some(charge => charge.statementId === item.id) &&
					!book.refunds.some(refund => refund.creditStatementId === item.id) &&
					!book.installments.some(
						installment => installment.statementId === item.id && installment.hasImportedAmount,
					),
			)
			.map(item => item.id),
	);
	book.statements = book.statements.filter(item => !retired.has(item.id));
	ensureBookStatement(book, period.firstStatementDate, {
		dueDate: period.firstDueDate,
		statementDate: period.firstStatementDate,
	});
	for (const purchase of book.purchases) {
		const dates = purchase.installmentStatementDates ?? [];
		purchase.installmentStatementDates = dates.map((item, index) =>
			purchase.installmentImportedNumbers?.includes(index + 1) ||
			(item && item.statementDate < period.firstStatementDate)
				? item
				: null,
		);
		for (const installment of book.installments.filter(
			item => item.purchaseId === purchase.id && retired.has(item.statementId),
		)) {
			installment.statementId = ensureBookStatement(
				book,
				installment.occurrenceDate,
				installmentBookDates(book, purchase, installment.number - 1),
			).id;
		}
	}
}

/** Complete invoice plan for calculations. Projections are never persisted as occurrences. */
export function creditBookPlan(book: CreditBook) {
	for (const statement of book.statements)
		assertStatementAmount(statement.manualTotalAmount ?? null, book.card.currency);
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
				const dates = installmentBookDates(book, purchase, index);
				statement = registeredBookStatement(statements, dates);
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
		book.refunds.filter(
			refund =>
				!refund.deletedAt &&
				(refund.creditDate <= asOf || Boolean(refund.canceledInstallmentNumbers?.length)),
		),
		refund => refund.purchaseId,
	);
	return book.purchases.flatMap(purchase =>
		calculate(purchase, refunds.get(purchase.id) ?? [], installments.get(purchase.id) ?? []),
	);
}

export function materializeBookInstallments(book: CreditBook, asOf = currentDateKey()) {
	assertDateKey(asOf);
	// A previous import may have corrected a cutoff without rebuilding its concrete links.
	const invalid = book.purchases.filter(purchase => {
		const first = book.installments.find(item => item.purchaseId === purchase.id && item.number === 1);
		const statement = first && book.statements.find(item => item.id === first.statementId);
		// Concrete invoice is authoritative; a stale saved plan must not hide its corrected cutoff.
		const closing = statement?.statementDate ?? purchase.installmentStatementDates?.[0]?.statementDate;
		return closing && !statementIncludesDate(book.card, closing, purchase.purchaseDate);
	});
	if (invalid.length) recomposeBookInstallments(book, invalid);
	const canceled = new Map<string, Set<number>>();
	const effects = creditBookEffects(book, asOf);
	const effectsByRefund = new Map(effects.map(effect => [effect.refundId, effect]));
	const refundsByPurchase = Map.groupBy(
		book.refunds.filter(
			refund =>
				!refund.deletedAt &&
				(refund.creditDate <= asOf || Boolean(refund.canceledInstallmentNumbers?.length)),
		),
		refund => refund.purchaseId,
	);
	const existingOccurrences = new Set(book.installments.map(item => `${item.purchaseId}:${item.number}`));
	const occurrenceIds = new Set(book.installments.map(item => item.id));
	for (const purchase of book.purchases) {
		const refunds = refundsByPurchase.get(purchase.id) ?? [];
		canceled.set(
			purchase.id,
			new Set(
				refunds.flatMap(refund => effectsByRefund.get(refund.id)?.canceledInstallmentNumbers ?? []),
			),
		);
		purchase.installmentAmountsCents.forEach((amountCents, index) => {
			const number = index + 1;
			const occurrenceDate = installmentOccurrenceDate(purchase.purchaseDate, number);
			if (
				occurrenceDate > asOf ||
				canceled.get(purchase.id)?.has(number) ||
				existingOccurrences.has(`${purchase.id}:${number}`)
			)
				return;
			const statement = ensureBookStatement(
				book,
				occurrenceDate,
				installmentBookDates(book, purchase, index),
			);
			const id = number === 1 && !occurrenceIds.has(purchase.id) ? purchase.id : crypto.randomUUID();
			existingOccurrences.add(`${purchase.id}:${number}`);
			occurrenceIds.add(id);
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
	input: {
		amount?: number;
		creditDate?: string;
		policy?: RefundPolicy;
		id?: string;
		canceledInstallmentNumbers?: number[];
	},
	now = new Date().toISOString(),
) {
	const purchase = bookPurchase(book, purchaseId);
	const history = book.refunds.filter(refund => refund.purchaseId === purchase.id);
	const previous = history.filter(refund => !refund.deletedAt);
	const creditDate = input.creditDate || purchase.purchaseDate;
	const statement = ensureBookStatement(book, creditDate);
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
		needsCancellationDecision: input.canceledInstallmentNumbers === undefined && firstFull && future,
		requestedPolicy: input.policy,
		savedPolicy: book.card.refundPolicy,
	});
	const refund: BookRefund = {
		...createCreditRefund(purchase, previous, {
			amountCents,
			canceledInstallmentNumbers: input.canceledInstallmentNumbers,
			creditDate,
			creditStatementId: statement.id,
			hasPreviousRefundHistory: history.length > 0,
			id: input.id ?? crypto.randomUUID(),
			policy: input.canceledInstallmentNumbers?.length ? "CANCEL_FUTURE_INSTALLMENTS" : decision.policy,
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
	changes: { amount?: number; creditDate?: string; canceledInstallmentNumbers?: number[] },
	now = new Date().toISOString(),
) {
	const purchase = bookPurchase(book, purchaseId);
	const previous = activePurchaseRefunds(book, purchaseId);
	const existing = previous.find(item => item.id === refundId);
	if (!existing) throw new RangeError("Reembolso não encontrado");
	const statement = changes.creditDate ? ensureBookStatement(book, changes.creditDate) : undefined;
	const edited = editCreditRefund(purchase, previous, refundId, {
		...(changes.canceledInstallmentNumbers !== undefined && {
			canceledInstallmentNumbers: [...changes.canceledInstallmentNumbers],
		}),
		...(changes.amount !== undefined && {
			amountCents: moneyCents(changes.amount, 1, book.card.currency),
		}),
		...(changes.creditDate && { creditDate: changes.creditDate, creditStatementId: statement!.id }),
	});
	if (changes.canceledInstallmentNumbers !== undefined)
		edited.policy = changes.canceledInstallmentNumbers.length
			? "CANCEL_FUTURE_INSTALLMENTS"
			: "KEEP_INSTALLMENTS";
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
			distributePurchaseCents(
				moneyCents(totalAmount, 1, book.card.currency),
				installments,
				undefined,
				book.card.installmentRemainderOnFirst,
			),
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
	if (sumCents(participantCents) > totalCents) throw new RangeError("Rateio do reembolso inválido");
	return participantCents.map(amount => {
		assertCents(amount);
		return (
			Math.floor((amount * Math.min(totalCents, beforeCents + refundCents)) / totalCents) -
			Math.floor((amount * Math.min(totalCents, beforeCents)) / totalCents)
		);
	});
}

/** Invoice presentation only. These rows are never saved as duplicated purchases. */
export function creditBookEntries(book: CreditBook, includeForecasts = true) {
	const plan = creditBookPlan(book);
	const today = currentDateKey();
	const asOf = includeForecasts ? "9999-12-31" : today;
	const effects = creditBookEffects(book, asOf, plan);
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
	const refinancingLinks = bookRefinancingLinks(book);
	const entries = book.purchases.flatMap(purchase => {
		const refunds = (refundsByPurchase.get(purchase.id) ?? []).map(refund => ({
			amount: refund.amountCents / currencyScale(book.card.currency),
			canceledAmount: byRefund.get(refund.id)!.canceledAmountCents / currencyScale(book.card.currency),
			canceledInstallmentNumbers: refund.canceledInstallmentNumbers,
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
			if (!concrete && !includeForecasts && !canceled.has(item.number)) return [];
			return [
				{
					...purchase,
					...refinancingLinks.get(purchase.id),
					currentInstallment: item.number,
					description: refinancingLinks.get(purchase.id)?.refinancedFromPurchaseId
						? `Parcelamento - ${purchasesById.get(refinancingLinks.get(purchase.id)!.refinancingOriginalPurchaseId!)!.description}`
						: purchase.description,
					entryKind: "INSTALLMENT" as const,
					hasImportedAmount: concrete?.hasImportedAmount ?? false,
					hasRefund: refunds.length > 0,
					id: concrete?.id ?? `forecast-${purchase.id}-${item.number}`,
					installmentAmount: item.amountCents / currencyScale(book.card.currency),
					installments: purchase.installmentAmountsCents.length,
					isForecast:
						!concrete &&
						(purchase.id.startsWith("forecast:") || purchase.purchaseDate.slice(0, 10) > today),
					isFullySynced:
						(concreteByPurchase.get(purchase.id) ?? []).length ===
							purchase.installmentAmountsCents.length &&
						(concreteByPurchase.get(purchase.id) ?? []).every(row => row.hasImportedAmount),
					isRefund: false,
					isReimbursed: canceled.has(item.number),
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
					tagIds: purchasesById.get(
						refinancingLinks.get(purchase.id)?.refinancingOriginalPurchaseId ?? purchase.id,
					)!.tagIds,
					totalAmount: purchase.totalAmountCents / currencyScale(book.card.currency),
				},
			];
		});
	});
	const refunds = book.refunds
		.filter(
			refund =>
				!refund.deletedAt &&
				(refund.creditDate <= asOf || Boolean(refund.canceledInstallmentNumbers?.length)),
		)
		.map(refund => {
			const purchase = purchasesById.get(refund.purchaseId);
			if (!purchase) throw new RangeError("Compra não encontrada");
			return {
				...purchase,
				createdAt: refund.createdAt,
				currentInstallment: 1,
				entryKind: "REFUND" as const,
				externalId: refund.externalId ?? null,
				hasImportedAmount: Boolean(refund.externalId),
				hasRefund: false,
				id: refund.id,
				installmentAmount:
					-byRefund.get(refund.id)!.creditAmountCents / currencyScale(book.card.currency),
				installments: 1,
				isForecast: false,
				isFullySynced: Boolean(refund.externalId),
				isRefund: true,
				isReimbursed: false,
				isSettled: false,
				isStatementCharge: false,
				isSynced: Boolean(refund.externalId),
				occurrenceDate: refund.creditDate,
				originalPurchaseDate: purchase.purchaseDate,
				parentId: undefined,
				purchaseDate: refund.creditDate,
				purchaseId: purchase.id,
				refund: {
					amount: refund.amountCents / currencyScale(book.card.currency),
					canceledAmount:
						byRefund.get(refund.id)!.canceledAmountCents / currencyScale(book.card.currency),
					canceledInstallmentNumbers: refund.canceledInstallmentNumbers,
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
		isReimbursed: false,
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

function recomposedPurchaseCalendar(
	book: CreditBook,
	purchase: BookPurchase,
	firstStatement?: BookStatement,
) {
	const resolve = (date: string) => {
		for (let offset = 0; ; offset++) {
			const month = installmentOccurrenceDate(date, offset + 1).slice(0, 7);
			const standard = purchaseStatementDates(book.card, `${month}-01`);
			const cycles = book.statements
				.filter(item => item.statementDate.slice(0, 7) === month)
				.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate));
			const cycle = cycles.find(item => statementIncludesDate(book.card, item.statementDate, date));
			if (cycle) return cycle;
			if (
				!cycles.length &&
				standard.statementDate.slice(0, 7) === month &&
				statementIncludesDate(book.card, standard.statementDate, date)
			)
				return ensureBookStatement(book, date, standard);
		}
	};

	const first = firstStatement ?? resolve(purchase.purchaseDate);
	if (book.card.calendarHistory?.length) {
		const draft = {
			...purchase,
			installmentStatementDates: [{ dueDate: first.dueDate, statementDate: first.statementDate }],
		};
		const calendarBook = {
			...book,
			installments: book.installments.filter(item => item.purchaseId !== purchase.id),
		};
		return purchase.installmentAmountsCents.map((_, index) => {
			const dates = installmentBookDates(calendarBook, draft, index);
			draft.installmentStatementDates[index] = {
				dueDate: dates.dueDate,
				statementDate: dates.statementDate,
			};
			return draft.installmentStatementDates[index]!;
		});
	}
	return purchase.installmentAmountsCents.map((_, index) => {
		if (index === 0) return { dueDate: first.dueDate, statementDate: first.statementDate };
		const month = installmentOccurrenceDate(first.dueDate, index + 1).slice(0, 7);
		const existing = book.statements
			.filter(item => item.dueDate.slice(0, 7) === month)
			.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate))[0];
		if (existing) return { dueDate: existing.dueDate, statementDate: existing.statementDate };
		return paymentStatementDates(book.card, `${month}-01`);
	});
}

export function assertStatementAmount(amount: number | null, currency = "BRL") {
	if (
		amount !== null &&
		(!Number.isFinite(amount) ||
			!Number.isSafeInteger(Math.round(amount * currencyScale(currency))) ||
			Math.abs(amount) >= 1e12 ||
			Math.abs(amount * currencyScale(currency) - Math.round(amount * currencyScale(currency))) > 1e-7)
	)
		throw new RangeError("Valor da fatura inválido");
}

/** Called only by writers. Read-only and forecast replays never mutate checkpoints. */
export function removeRedundantStatementAmounts(book: CreditBook, asOf = currentDateKey()) {
	const replay = replayCreditBook(book, asOf);
	const byId = new Map(book.statements.map(statement => [statement.id, statement]));
	const removed: string[] = [];
	for (const computed of replay.statements) {
		const stored = byId.get(computed.id);
		if (stored?.manualTotalAmount == null || stored.statementDate > asOf) continue;
		if (
			toCents(stored.manualTotalAmount, book.card.currency) ===
			toCents(computed.calculatedTotalAmount, book.card.currency)
		) {
			stored.manualTotalAmount = null;
			removed.push(stored.id);
		}
	}
	return removed;
}

/** Set a cycle total independently of imported purchases; null restores calculation. */
export function setBookStatementAmount(
	book: CreditBook,
	statementId: string,
	amount: number | null,
	dates?: { statementDate: string; dueDate: string },
) {
	assertStatementAmount(amount, book.card.currency);
	if (dates) {
		assertDateKey(dates.statementDate);
		assertDateKey(dates.dueDate);
		if (dates.dueDate < dates.statementDate)
			throw new RangeError("Vencimento deve ser igual ou posterior ao fechamento");
	}
	const statement =
		book.statements.find(item => item.id === statementId && !item.isForecast) ??
		(dates ? ensureBookStatement(book, dates.statementDate, dates) : undefined);
	if (!statement) throw new RangeError("Fatura não encontrada");
	statement.manualTotalAmount = amount === null ? null : roundMoney(amount, book.card.currency);
}

/** Recompose purchases against the corrected invoice calendar, preserving occurrence IDs. */
export function updateBookStatementDates(
	book: CreditBook,
	statementId: string,
	dates: { statementDate: string; dueDate: string },
) {
	assertDateKey(dates.statementDate);
	assertDateKey(dates.dueDate);
	if (dates.dueDate < dates.statementDate)
		throw new RangeError("Vencimento deve ser igual ou posterior ao fechamento");
	const statement = book.statements.find(item => item.id === statementId && !item.isForecast);
	if (!statement) throw new RangeError("Fatura não encontrada");
	if (book.statements.some(item => item.id !== statementId && item.statementDate === dates.statementDate))
		throw new RangeError("Já existe uma fatura com esta data de fechamento");
	const sameCycle =
		statement.statementDate === dates.statementDate &&
		statement.dueDate.slice(0, 7) === dates.dueDate.slice(0, 7);
	const previousClosing = statement.statementDate;
	for (const purchase of book.purchases)
		for (const saved of purchase.installmentStatementDates ?? [])
			if (saved?.statementDate === previousClosing) Object.assign(saved, dates);
	Object.assign(statement, dates);
	if (sameCycle) {
		// A due-day correction does not change purchase cutoffs or imported assignments.
		// Refresh saved dates too, so future materialization uses the corrected cycle.
		for (const purchase of book.purchases) {
			for (const installmentDates of purchase.installmentStatementDates ?? []) {
				if (installmentDates?.statementDate === dates.statementDate)
					installmentDates.dueDate = dates.dueDate;
			}
		}
		return;
	}

	recomposeBookInstallments(book);
	for (const refund of book.refunds) {
		refund.creditStatementId = ensureBookStatement(book, refund.creditDate).id;
	}
}

/** Rebuild derived assignments while preserving concrete identities and confirmed amounts. */
function recomposeBookInstallments(book: CreditBook, purchases = book.purchases) {
	for (const purchase of purchases) {
		const previous = purchase.installmentStatementDates;
		const recomposed = recomposedPurchaseCalendar(book, purchase);
		purchase.installmentStatementDates = recomposed.map((dates, index) =>
			purchase.installmentImportedNumbers?.includes(index + 1) &&
			previous?.[index] &&
			(index > 0 ||
				statementIncludesDate(
					book.card,
					book.statements.find(
						statement =>
							statement.id ===
							book.installments.find(
								item => item.purchaseId === purchase.id && item.number === 1,
							)?.statementId,
					)?.statementDate ?? previous[index]!.statementDate,
					purchase.purchaseDate,
				))
				? previous[index]!
				: dates,
		);
		for (const installment of book.installments.filter(item => item.purchaseId === purchase.id)) {
			installment.occurrenceDate = installmentOccurrenceDate(purchase.purchaseDate, installment.number);
			installment.statementId = ensureBookStatement(
				book,
				installment.occurrenceDate,
				purchase.installmentStatementDates[installment.number - 1]!,
			).id;
		}
	}
}

/** Explicit historical recomposition preserves occurrence IDs and imported calendars. */
export function updateBookPurchaseDate(book: CreditBook, purchaseId: string, purchaseDate: string) {
	assertDateKey(purchaseDate);
	const purchase = bookPurchase(book, purchaseId);
	const firstInstallment = book.installments.find(
		item => item.purchaseId === purchaseId && item.number === 1,
	);
	const firstStatement =
		purchase.purchaseDate === purchaseDate && firstInstallment
			? book.statements.find(item => item.id === firstInstallment.statementId)
			: undefined;
	purchase.purchaseDate = purchaseDate;
	const calendar = recomposedPurchaseCalendar(book, purchase, firstStatement);
	purchase.installmentStatementDates = purchase.installmentAmountsCents.map((_, index) =>
		purchase.installmentImportedNumbers?.includes(index + 1)
			? (purchase.installmentStatementDates?.[index] ?? null)
			: calendar[index]!,
	);
	const importedCalendar = purchase.installmentStatementDates;
	for (const number of purchase.installmentImportedNumbers ?? []) {
		const dates = importedCalendar[number - 1];
		if (dates) synchronizeImportedStatementDates(book, dates);
	}
	purchase.installmentStatementDates = importedCalendar;
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
	assertBookPurchaseCanMove(source, rootId);
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
	input: {
		feeAmount?: number;
		totalAmount?: number;
		installments: number;
		purchaseDate: string;
		time?: string | null;
		sourceTime?: string | null;
	},
) {
	const source = bookPurchase(book, purchaseId);
	if (bookRefinancingLinks(book).get(source.id)?.refinancedFromPurchaseId)
		throw new RangeError("Não é possível reparcelar um reparcelamento");
	for (const time of [input.time, input.sourceTime]) {
		if (time != null && !/^(?:[01]\d|2[0-3]):[0-5]\d(?::[0-5]\d)?$/u.test(time))
			throw new RangeError("Horário inválido");
	}
	assertDateKey(input.purchaseDate);
	if (!Number.isInteger(input.installments) || input.installments < 1 || input.installments > 48)
		throw new RangeError("Quantidade de parcelas inválida");
	const ledger = replayCreditBook(book).statements;
	const selected = creditBookEntries(book).filter(
		row =>
			row.purchaseId === source.id &&
			!row.isRefund &&
			!row.isStatementCharge &&
			!row.isSettled &&
			!row.isReimbursed &&
			!row.settledByPurchaseId &&
			!book.statements.find(s => s.id === row.statementId)?.isPaid &&
			!ledger.find(s => s.id === row.statementId)?.isPaid,
	);
	if (!selected.length) throw new RangeError("Não há parcelas disponíveis");
	const settledCents = sumCents(
		selected.map(row => moneyCents(row.installmentAmount, 0, book.card.currency)),
	);
	const totalCents =
		input.totalAmount === undefined
			? settledCents + moneyCents(input.feeAmount ?? 0, 0, book.card.currency)
			: moneyCents(input.totalAmount, 1, book.card.currency);
	const totalAmount = totalCents / currencyScale(book.card.currency);
	const purchase = newBookPurchase(book, {
		description: `Parcelamento - ${bookPurchase(book, bookRefinancingLinks(book).get(source.id)?.refinancingOriginalPurchaseId ?? source.id).description}`,
		installments: input.installments,
		purchaseDate: input.purchaseDate,
		refinancingFeeAmount: Math.max(0, totalCents - settledCents) / currencyScale(book.card.currency),
		storeName: source.storeName,
		tagIds: source.tagIds,
		time: input.time ?? null,
		totalAmount,
	});
	for (const row of selected) {
		let installment = book.installments.find(
			item => item.purchaseId === source.id && item.number === row.currentInstallment,
		);
		if (!installment) {
			// Future settlement needs an occurrence to retain its replacement link in the ledger.
			const occurrenceDate = installmentOccurrenceDate(source.purchaseDate, row.currentInstallment);
			const statement = ensureBookStatement(
				book,
				occurrenceDate,
				source.installmentStatementDates?.[row.currentInstallment - 1] ?? undefined,
			);
			installment = {
				amountCents: moneyCents(row.installmentAmount, 0, book.card.currency),
				hasImportedAmount: false,
				id: crypto.randomUUID(),
				number: row.currentInstallment,
				occurrenceDate,
				purchaseId: source.id,
				settledByPurchaseId: purchase.id,
				statementId: statement.id,
			};
			book.installments.push(installment);
		}
		installment.isSettled = true;
		installment.settledByPurchaseId = purchase.id;
	}
	if (input.sourceTime !== undefined) {
		source.time = input.sourceTime;
		source.updatedAt = new Date().toISOString();
	}
	return { settledAmount: settledCents / currencyScale(book.card.currency), totalAmount };
}
