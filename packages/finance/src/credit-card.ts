export type FinancialDate = Date | string;
export const dateKey = (value: FinancialDate) =>
	typeof value === "string" ? value.slice(0, 10) : value.toISOString().slice(0, 10);
export const toCents = (value: number | string) => Math.round(Number(value) * 100);

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

export interface CardCalendar {
	statementDay: number;
	dueDay: number;
	workingDueDate?: boolean;
}
export interface StatementInput {
	id: string;
	creditCardId?: string;
	statementDate: FinancialDate;
	dueDate: FinancialDate;
	totalAmount: number | string;
	chargesAmount?: number | string;
	paidAmount?: number | string;
	/** Actual payments assigned by date. Stored paidAmount is never an input to replay. */
	periodPaymentAmount?: number;
}
export interface CardPayment {
	amount: number | string;
	date: FinancialDate;
}
export type StatementStatus = "OPEN" | "PAID" | "CARRIED";
export interface StatementBalance {
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

/** Purchases use closing dates; payments use the next due date, inclusive. */
export function paymentStatementDates(card: CardCalendar, paymentDate: FinancialDate) {
	const date = new Date(`${dateKey(paymentDate)}T12:00:00Z`);
	let dueMonth = date.getUTCMonth();
	if (dueDateForMonth(card, date.getUTCFullYear(), dueMonth) < dateKey(date)) dueMonth++;
	const due = monthDate(date.getUTCFullYear(), dueMonth, card.dueDay);
	const closingMonth = dueMonth - (card.dueDay <= card.statementDay ? 1 : 0);
	return {
		dueDate: dueDateForMonth(card, date.getUTCFullYear(), dueMonth),
		statementDate: dateKey(monthDate(due.getUTCFullYear(), closingMonth, card.statementDay)),
	};
}

export function paymentStatement<T extends Pick<StatementInput, "id" | "dueDate">>(
	statements: T[],
	paymentDate: FinancialDate,
) {
	return statements
		.toSorted((a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)) || a.id.localeCompare(b.id))
		.find(statement => dateKey(statement.dueDate) >= dateKey(paymentDate));
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
					toCents(statement.totalAmount) !== 0 || toCents(statement.chargesAmount ?? 0) !== 0,
			)
			.map(statement => dateKey(statement.statementDate)),
		...payments.map(payment => paymentStatementDates(card, payment.date).statementDate),
	].toSorted()[0];
	const last = closingDates.at(-1);
	if (!first || !last) return statements;
	const result = [...statements];
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
): Array<T & StatementBalance> {
	const chronological = statements.toSorted(
		(a, b) => dateKey(a.dueDate).localeCompare(dateKey(b.dueDate)) || a.id.localeCompare(b.id),
	);
	const paidByStatement = new Map<string, number>();
	if (payments)
		for (const payment of payments) {
			if (dateKey(payment.date) > dateKey(asOf)) continue;
			const target = paymentStatement(chronological, payment.date);
			if (target)
				paidByStatement.set(
					target.id,
					(paidByStatement.get(target.id) ?? 0) + toCents(payment.amount),
				);
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
		const charges = toCents(statement.chargesAmount ?? 0);
		const incomingDebt = Math.max(0, carry);
		const incomingCredit = Math.max(0, -carry);
		const amountDue = toCents(statement.totalAmount) + charges + incomingDebt;
		const periodPayment = payments
			? (paidByStatement.get(statement.id) ?? 0)
			: toCents(statement.periodPaymentAmount ?? statement.paidAmount ?? 0);
		const remaining = amountDue - incomingCredit - periodPayment;
		const transferred = remaining > 0 && dateKey(statement.dueDate) < dateKey(asOf) && hasNext;
		const status: StatementStatus = transferred
			? "CARRIED"
			: dateKey(statement.statementDate) <= dateKey(asOf) &&
					remaining <= 0 &&
					(amountDue !== 0 || incomingCredit > 0 || periodPayment > 0)
				? "PAID"
				: "OPEN";
		balances.set(statement.id, {
			amountDue: amountDue / 100,
			balanceAmount: ignored || transferred || (remaining < 0 && hasNext) ? 0 : remaining / 100,
			carriedInAmount: incomingDebt / 100,
			carriedOutAmount: transferred ? remaining / 100 : 0,
			chargesAmount: charges / 100,
			creditInAmount: incomingCredit / 100,
			isPaid: status === "PAID",
			paidAmount: Math.max(0, Math.min(Math.max(0, amountDue), incomingCredit + periodPayment)) / 100,
			periodPaymentAmount: periodPayment / 100,
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
