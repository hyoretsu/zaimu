import { currencyScale } from "./money";
export type FinancialDate = Date | string;
export const dateKey = (value: FinancialDate) =>
	typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export const toCents = (value: number | string, currency = "BRL") =>
	Math.round(Number(value) * currencyScale(currency));

/** Stored cutoff is exclusive; the selected invoice is included in the ignored history. */
export function statementCutoffAfter(statementDate: FinancialDate) {
	const next = new Date(`${dateKey(statementDate)}T12:00:00Z`);
	next.setUTCDate(next.getUTCDate() + 1);
	return dateKey(next);
}

export function currentDateKey() {
	const now = new Date();
	return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, "0")}-${String(now.getDate()).padStart(2, "0")}`;
}

export type CardTransitionMode = "EXTRA_CYCLE" | "NEXT_CYCLE";
export type CardInstallmentMode = "PER_CYCLE" | "PER_MONTH";
export type CardCalendarPeriod = Readonly<{
	effectiveDate: string;
	statementDay: number;
	dueDay: number;
	workingDueDate: boolean;
	firstStatementDate: string;
	firstDueDate: string;
	transitionMode: CardTransitionMode;
	installmentMode: CardInstallmentMode;
}>;

export interface CardCalendar {
	calendarHistory?: CardCalendarPeriod[] | null;
	statementClosingInclusive?: boolean;
	currency?: string;
	statementDay: number;
	dueDay: number;
	workingDueDate?: boolean;
}
export interface StatementInput {
	manualTotalAmount?: number | null;
	currency?: string;
	id: string;
	creditCardId?: string;
	statementDate: FinancialDate;
	dueDate: FinancialDate;
	totalAmount: number | string;
	chargesAmount?: number | string;
	paidAmount?: number | string;
	/** Actual payments assigned by date. Stored paidAmount is never an input to replay. */
	periodPaymentAmount?: number;
	/** Actual payments made strictly before closing, already included in invoiceAmount. */
	preClosingPaymentAmount?: number;
}
export interface CardPayment {
	amount: number | string;
	date: FinancialDate;
}
export type StatementStatus = "OPEN" | "PAID" | "CARRIED";
export interface StatementBalance {
	/** Net invoice total after incoming credit and payments made before closing. */
	invoiceAmount: number;
	preClosingPaymentAmount: number;
	scheduledPaymentAmount: number;
	/** Total before this override and before payments, including incoming debt/credit. */
	calculatedTotalAmount: number;
	amountDue: number;
	balanceAmount: number;
	carriedInAmount: number;
	carriedOutAmount: number;
	chargesAmount: number;
	creditInAmount: number;
	paidAmount: number;
	periodPaymentAmount: number;
	isPaid: boolean;
	status: StatementStatus;
}

function monthDate(year: number, month: number, day: number) {
	return new Date(
		Date.UTC(year, month, Math.min(day, new Date(Date.UTC(year, month + 1, 0)).getUTCDate())),
	);
}

export function dueDateForMonth(card: CardCalendar, year: number, month: number) {
	const due = monthDate(year, month, card.dueDay);
	if (card.workingDueDate) {
		if (due.getUTCDay() === 6) due.setUTCDate(due.getUTCDate() + 2);
		if (due.getUTCDay() === 0) due.setUTCDate(due.getUTCDate() + 1);
	}
	return dateKey(due);
}

export function statementDueDate(card: CardCalendar, statementDate: FinancialDate) {
	const closing = new Date(`${dateKey(statementDate)}T12:00:00Z`);
	const offset = card.dueDay <= card.statementDay ? 1 : 0;
	return dueDateForMonth(card, closing.getUTCFullYear(), closing.getUTCMonth() + offset);
}

export function recalculateStatementDueDate(
	card: CardCalendar,
	statementDate: FinancialDate,
	currentDueDate: FinancialDate,
	previousCard: CardCalendar = card,
) {
	const current = dateKey(currentDueDate);
	const previousNominal = statementDueDate({ ...previousCard, workingDueDate: false }, statementDate);
	const previousAdjusted = statementDueDate({ ...previousCard, workingDueDate: true }, statementDate);
	const nominal = statementDueDate({ ...card, workingDueDate: false }, statementDate);
	const adjusted = statementDueDate({ ...card, workingDueDate: true }, statementDate);
	if (
		current === previousNominal ||
		current === previousAdjusted ||
		current === nominal ||
		current === adjusted
	)
		return card.workingDueDate ? adjusted : nominal;
	if (!card.workingDueDate) return current;
	const date = new Date(`${current}T12:00:00Z`);
	if (date.getUTCDay() === 6) date.setUTCDate(date.getUTCDate() + 2);
	if (date.getUTCDay() === 0) date.setUTCDate(date.getUTCDate() + 1);
	return dateKey(date);
}

/** Payments remain in their invoice through the first weekday strictly after its due date. */
export function statementPaymentDeadline(dueDate: FinancialDate) {
	const date = new Date(`${dateKey(dueDate)}T12:00:00Z`);
	do {
		date.setUTCDate(date.getUTCDate() + 1);
	} while (date.getUTCDay() === 0 || date.getUTCDay() === 6);
	return dateKey(date);
}

export function paymentStatementDates(card: CardCalendar, paymentDate: FinancialDate) {
	const date = new Date(`${dateKey(paymentDate)}T12:00:00Z`);
	const year = date.getUTCFullYear();
	let dueMonth = date.getUTCMonth() - 1;
	while (statementPaymentDeadline(dueDateForMonth(card, year, dueMonth)) < dateKey(date)) dueMonth++;
	const closingMonth = dueMonth - (card.dueDay <= card.statementDay ? 1 : 0);
	return {
		dueDate: dueDateForMonth(card, year, dueMonth),
		statementDate: dateKey(monthDate(year, closingMonth, card.statementDay)),
	};
}

/** Index actual bank due dates once. Equal dates retain the existing ID tie-break. */
export function createStatementPaymentResolver<T extends Pick<StatementInput, "id" | "dueDate">>(
	statements: T[],
) {
	const ordered = statements
		.map(statement => ({ date: statementPaymentDeadline(statement.dueDate), statement }))
		.sort(
			(a, b) =>
				dateKey(a.statement.dueDate).localeCompare(dateKey(b.statement.dueDate)) ||
				a.statement.id.localeCompare(b.statement.id),
		);
	return (paymentDate: FinancialDate) => {
		const date = dateKey(paymentDate);
		let low = 0;
		let high = ordered.length;
		while (low < high) {
			const middle = (low + high) >>> 1;
			if (ordered[middle]!.date < date) low = middle + 1;
			else high = middle;
		}
		return ordered[low]?.statement;
	};
}
export function paymentStatement<T extends Pick<StatementInput, "id" | "dueDate">>(
	statements: T[],
	paymentDate: FinancialDate,
) {
	return createStatementPaymentResolver(statements)(paymentDate);
}

/** Fill monthly gaps through the query date and every payment date, preserving actual bank dates. */
export function statementCycles<T extends StatementInput>(
	statements: T[],
	card: CardCalendar,
	payments: CardPayment[],
	create: (dates: ReturnType<typeof paymentStatementDates>) => T,
	asOf: FinancialDate = currentDateKey(),
) {
	const dates = [dateKey(asOf), ...payments.map(payment => dateKey(payment.date))].toSorted();
	const targets = dates.map(date => paymentStatementDates(card, date));
	const closingDates = [
		...statements.map(statement => dateKey(statement.statementDate)),
		...targets.map(t => t.statementDate),
	].toSorted();
	const first = [
		...statements
			.filter(
				statement =>
					toCents(statement.manualTotalAmount ?? statement.totalAmount) !== 0 ||
					toCents(statement.chargesAmount ?? 0) !== 0,
			)
			.map(statement => dateKey(statement.statementDate)),
		...payments.map(payment => paymentStatementDates(card, payment.date).statementDate),
	].toSorted()[0];
	const last = closingDates.at(-1);
	if (!first || !last) return statements;
	const result = [...statements];
	if (card.calendarHistory?.length) {
		const known = new Set(statements.map(statement => dateKey(statement.statementDate)));
		for (const cycle of calendarCycles(card, first, last))
			if (!known.has(cycle.statementDate)) result.push(create(cycle));
		return result;
	}
	const known = new Set(statements.map(statement => dateKey(statement.statementDate).slice(0, 7)));
	const cursor = new Date(`${first.slice(0, 7)}-01T12:00:00Z`);
	while (dateKey(cursor).slice(0, 7) <= last.slice(0, 7)) {
		const closing = monthDate(cursor.getUTCFullYear(), cursor.getUTCMonth(), card.statementDay);
		if (!known.has(dateKey(closing).slice(0, 7)))
			result.push(
				create({ dueDate: statementDueDate(card, closing), statementDate: dateKey(closing) }),
			);
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	return result;
}

/** Replay by due date. Later payments cannot settle an earlier historical invoice. */
export function calculateStatementBalances<T extends StatementInput>(
	statements: T[],
	payments?: CardPayment[],
	asOf: FinancialDate = currentDateKey(),
	ignoreBefore?: FinancialDate | null,
	currency = statements[0]?.currency ?? "BRL",
): Array<T & StatementBalance> {
	if (statements.some(statement => statement.currency && statement.currency !== currency))
		throw new RangeError("Faturas de moedas diferentes não podem compartilhar saldo");
	const chronological = statements.toSorted(
		(a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)) || a.id.localeCompare(b.id),
	);
	const paidByStatement = new Map<string, number>();
	const scheduledByStatement = new Map<string, number>();
	const preClosingByStatement = new Map<string, number>();
	const resolvePayment = createStatementPaymentResolver(chronological);
	if (payments)
		for (const payment of payments) {
			const amounts = dateKey(payment.date) > dateKey(asOf) ? scheduledByStatement : paidByStatement;
			const target = resolvePayment(payment.date);
			if (target) {
				amounts.set(target.id, (amounts.get(target.id) ?? 0) + toCents(payment.amount, currency));
				if (amounts === paidByStatement && dateKey(payment.date) < dateKey(target.statementDate))
					preClosingByStatement.set(
						target.id,
						(preClosingByStatement.get(target.id) ?? 0) + toCents(payment.amount, currency),
					);
			}
		}
	let carry = 0;
	const balances = new Map<string, StatementBalance>();
	for (const [index, statement] of chronological.entries()) {
		const ignored = Boolean(ignoreBefore && dateKey(statement.statementDate) < dateKey(ignoreBefore));
		if (
			ignoreBefore &&
			!ignored &&
			(index === 0 || dateKey(chronological[index - 1]!.statementDate) < dateKey(ignoreBefore))
		)
			carry = 0;
		const hasNext = index < chronological.length - 1;
		const charges = toCents(statement.chargesAmount ?? 0, currency);
		const incomingDebt = Math.max(0, carry);
		const incomingCredit = Math.max(0, -carry);
		const calculatedTotal =
			toCents(statement.totalAmount, currency) + charges + incomingDebt - incomingCredit;
		// A manual total already includes all incoming debt and credit. Expose amountDue
		// using the existing gross convention so consumers subtract credit only once.
		const effectiveTotal =
			statement.manualTotalAmount == null
				? calculatedTotal
				: toCents(statement.manualTotalAmount, currency);
		const amountDue = effectiveTotal + incomingCredit;
		const periodPayment = payments
			? (paidByStatement.get(statement.id) ?? 0)
			: toCents(statement.periodPaymentAmount ?? statement.paidAmount ?? 0, currency);
		const preClosingPayment = payments
			? (preClosingByStatement.get(statement.id) ?? 0)
			: toCents(statement.preClosingPaymentAmount ?? 0, currency);
		const remaining = amountDue - incomingCredit - periodPayment;
		const transferred =
			remaining > 0 && statementPaymentDeadline(statement.dueDate) < dateKey(asOf) && hasNext;
		const status: StatementStatus = transferred
			? "CARRIED"
			: dateKey(statement.statementDate) <= dateKey(asOf) &&
					remaining <= 0 &&
					(amountDue !== 0 || incomingCredit > 0 || periodPayment > 0)
				? "PAID"
				: "OPEN";
		balances.set(statement.id, {
			amountDue: amountDue / currencyScale(currency),
			balanceAmount:
				ignored || transferred || (remaining < 0 && hasNext)
					? 0
					: remaining / currencyScale(currency),
			calculatedTotalAmount: calculatedTotal / currencyScale(currency),
			carriedInAmount: incomingDebt / currencyScale(currency),
			carriedOutAmount: transferred ? remaining / currencyScale(currency) : 0,
			chargesAmount: charges / currencyScale(currency),
			creditInAmount: incomingCredit / currencyScale(currency),
			invoiceAmount: (effectiveTotal - preClosingPayment) / currencyScale(currency),
			isPaid: status === "PAID",
			paidAmount:
				Math.max(0, Math.min(Math.max(0, amountDue), incomingCredit + periodPayment)) /
				currencyScale(currency),
			periodPaymentAmount: periodPayment / currencyScale(currency),
			preClosingPaymentAmount: preClosingPayment / currencyScale(currency),
			scheduledPaymentAmount: (scheduledByStatement.get(statement.id) ?? 0) / currencyScale(currency),
			status,
		});
		carry = transferred ? remaining : Math.min(0, remaining);
	}
	return statements.map(statement => ({ ...statement, ...balances.get(statement.id)! }));
}

/** Bank statement summaries are not purchases; real financing costs are separate charges. */
export function statementEntryKind(description: string): "PURCHASE" | "CHARGE" | "BALANCE" {
	const value = description
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.trim();
	if (
		/^(saldo\s+(anterior|financiado)|saldo devedor anterior|total da fatura|pagamento(s)?\s+(de|da|recebido))/i.test(
			value,
		)
	)
		return "BALANCE";
	return /^(juros|multa|mora|encargos|iof)\b|^imposto.*operac/i.test(value) ? "CHARGE" : "PURCHASE";
}

interface ChargePurchase {
	id: string;
	statementId: string;
	installmentAmount: number | string;
	currentInstallment?: number;
	parentId?: string | null;
	description?: string;
	isStatementCharge?: boolean;
	isSettled?: boolean;
	feeAmount?: number | string | null;
	feeDescription?: string | null;
	refinancingFeeAmount?: number | string | null;
}

/** Split only real recorded financing costs; ordinary purchase fees retain their purchase treatment. */
export function statementCharges(purchases: ChargePurchase[]) {
	const result = new Map<string, number>();
	const add = (id: string, cents: number) => result.set(id, (result.get(id) ?? 0) + cents);
	const groups = Map.groupBy(
		purchases.filter(purchase => !purchase.isSettled),
		purchase => purchase.parentId ?? purchase.id,
	);
	for (const group of groups.values()) {
		const root = group.find(purchase => !purchase.parentId);
		const fee = toCents(root?.refinancingFeeAmount ?? 0);
		const total = group.reduce((sum, purchase) => sum + toCents(purchase.installmentAmount), 0);
		let cumulative = 0;
		let allocated = 0;
		for (const purchase of group.toSorted(
			(a, b) => (a.currentInstallment ?? 1) - (b.currentInstallment ?? 1),
		)) {
			const amount = toCents(purchase.installmentAmount);
			cumulative += amount;
			const proportional = total > 0 ? Math.round((fee * cumulative) / total) : 0;
			const charges =
				(purchase.isStatementCharge ?? statementEntryKind(purchase.description ?? "") === "CHARGE")
					? amount
					: purchase.feeDescription === "IOF do parcelamento"
						? toCents(purchase.feeAmount ?? 0)
						: proportional - allocated;
			allocated = proportional;
			add(purchase.statementId, charges);
		}
	}
	return result;
}

/** A saved period is a snapshot; later institution rule changes cannot rewrite it. */
export function calendarAt(card: CardCalendar, date: string): CardCalendar {
	const history = card.calendarHistory ?? [];
	const period =
		history
			.filter(item => item.effectiveDate <= date)
			.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
			.at(-1) ?? history[0];
	return period ? { ...card, ...period, calendarHistory: undefined } : card;
}

/** Generate every configured closing, including short transition cycles. */
export function calendarCycles(card: CardCalendar, from: string, through: string) {
	const history = card.calendarHistory ?? [];
	const result = new Map<string, { statementDate: string; dueDate: string }>();
	const cursor = new Date(`${from.slice(0, 7)}-01T12:00:00Z`);
	while (dateKey(cursor).slice(0, 7) <= through.slice(0, 7)) {
		const candidates = history.length ? history : [null];
		for (const period of candidates) {
			const calendar = period ? { ...card, ...period, calendarHistory: undefined } : card;
			const closing = dateKey(
				monthDate(cursor.getUTCFullYear(), cursor.getUTCMonth(), calendar.statementDay),
			);
			const active = history
				.filter(item => item.firstStatementDate <= closing)
				.toSorted((a, b) => a.firstStatementDate.localeCompare(b.firstStatementDate))
				.at(-1);
			if (period && active !== period) continue;
			if (closing >= from && closing <= through)
				result.set(closing, {
					dueDate:
						period?.firstStatementDate === closing
							? period.firstDueDate
							: statementDueDate(calendar, closing),
					statementDate: closing,
				});
		}
		cursor.setUTCMonth(cursor.getUTCMonth() + 1);
	}
	for (const period of history)
		if (period.firstStatementDate >= from && period.firstStatementDate <= through)
			result.set(period.firstStatementDate, {
				dueDate: period.firstDueDate,
				statementDate: period.firstStatementDate,
			});
	return [...result.values()].sort((a, b) => a.statementDate.localeCompare(b.statementDate));
}

export function assertCalendarPeriod(period: CardCalendarPeriod) {
	for (const key of [period.effectiveDate, period.firstStatementDate, period.firstDueDate]) {
		const date = new Date(`${key}T12:00:00Z`);
		if (!/^\d{4}-\d{2}-\d{2}$/.test(key) || !Number.isFinite(date.valueOf()) || dateKey(date) !== key)
			throw new RangeError("Data de transição inválida");
	}
	if (
		![period.statementDay, period.dueDay].every(day => Number.isInteger(day) && day >= 1 && day <= 31) ||
		period.firstDueDate < period.firstStatementDate ||
		period.firstStatementDate < period.effectiveDate ||
		!["EXTRA_CYCLE", "NEXT_CYCLE"].includes(period.transitionMode) ||
		!["PER_CYCLE", "PER_MONTH"].includes(period.installmentMode)
	)
		throw new RangeError("Calendário de transição inválido");
}

export function previewCalendarTransition(
	previous: CardCalendar,
	next: CardCalendar,
	effectiveDate: string,
	transitionMode: CardTransitionMode = "NEXT_CYCLE",
	installmentMode: CardInstallmentMode = "PER_MONTH",
): CardCalendarPeriod {
	const base = new Date(`${effectiveDate}T12:00:00Z`);
	let closing = dateKey(monthDate(base.getUTCFullYear(), base.getUTCMonth(), next.statementDay));
	if (closing < effectiveDate)
		closing = dateKey(monthDate(base.getUTCFullYear(), base.getUTCMonth() + 1, next.statementDay));
	const oldDue = paymentStatementDates(calendarAt(previous, effectiveDate), effectiveDate).dueDate;
	if (
		transitionMode === "NEXT_CYCLE" &&
		statementDueDate(next, closing).slice(0, 7) <= oldDue.slice(0, 7)
	) {
		const date = new Date(`${closing}T12:00:00Z`);
		closing = dateKey(monthDate(date.getUTCFullYear(), date.getUTCMonth() + 1, next.statementDay));
	}
	return {
		dueDay: next.dueDay,
		effectiveDate,
		firstDueDate: statementDueDate(next, closing),
		firstStatementDate: closing,
		installmentMode,
		statementDay: next.statementDay,
		transitionMode,
		workingDueDate: next.workingDueDate ?? false,
	};
}

/** Decode JSON/transport calendars before they enter financial calculations. */
export function readCalendarHistory(value: unknown): CardCalendarPeriod[] | null {
	if (value == null) return null;
	if (!Array.isArray(value)) throw new RangeError("Histórico do calendário inválido");
	return value.map(item => {
		if (!item || typeof item !== "object") throw new RangeError("Período do calendário inválido");
		const row = item as Record<string, unknown>;
		if (
			typeof row.effectiveDate !== "string" ||
			typeof row.firstStatementDate !== "string" ||
			typeof row.firstDueDate !== "string" ||
			typeof row.workingDueDate !== "boolean" ||
			(row.transitionMode !== "EXTRA_CYCLE" && row.transitionMode !== "NEXT_CYCLE") ||
			(row.installmentMode !== "PER_CYCLE" && row.installmentMode !== "PER_MONTH")
		)
			throw new RangeError("Período do calendário inválido");
		const period: CardCalendarPeriod = {
			dueDay: Number(row.dueDay),
			effectiveDate: row.effectiveDate,
			firstDueDate: row.firstDueDate,
			firstStatementDate: row.firstStatementDate,
			installmentMode: row.installmentMode,
			statementDay: Number(row.statementDay),
			transitionMode: row.transitionMode,
			workingDueDate: row.workingDueDate,
		};
		assertCalendarPeriod(period);
		return period;
	});
}

export function normalizeCardCalendar<
	T extends { calendarHistory?: unknown; statementDay: number; dueDay: number },
>(card: T) {
	const { calendarHistory, ...rest } = card;
	return { ...rest, calendarHistory: readCalendarHistory(calendarHistory) };
}
