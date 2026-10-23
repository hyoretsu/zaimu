import { type CreditBook, synchronizeImportedStatementDates } from "@zaimu/finance/credit-book";
import { purchaseStatementDates } from "@zaimu/finance/credit-purchase";

/** Missing PDF dates retain the registered cycle, or the card calendar for a new cycle. */
export function resolveImportStatementDates(
	dates: { statementDate?: string; dueDate?: string },
	book: Pick<CreditBook, "card" | "statements">,
	statementId?: string,
) {
	const reference = dates.statementDate ?? dates.dueDate;
	if (!reference) throw new Error("Não foi possível identificar o período da fatura");
	const candidates = book.statements.filter(statement => !statement.isForecast);
	const exact =
		candidates.find(statement => dates.statementDate && statement.statementDate === dates.statementDate) ??
		candidates.find(statement => dates.dueDate && statement.dueDate === dates.dueDate);
	const field = dates.statementDate ? "statementDate" : "dueDate";
	const sameMonth = candidates.filter(statement => statement[field].slice(0, 7) === reference.slice(0, 7));
	if (!statementId && !exact && (!dates.statementDate || !dates.dueDate) && sameMonth.length > 0)
		throw new Error("Mais de uma fatura corresponde ao período importado");
	const cycle = statementId ? candidates.find(item => item.id === statementId) : exact;
	if (statementId && !cycle) throw new Error("Fatura não encontrada");
	if (!cycle) {
		const [year, month] = reference.split("-").map(Number);
		const calendars = [-2, -1, 0, 1, 2].map(offset =>
			purchaseStatementDates(
				book.card,
				new Date(Date.UTC(year!, month! - 1 + offset, 1, 12)).toISOString().slice(0, 10),
			),
		);
		const nominal = calendars.find(calendar => calendar[field].slice(0, 7) === reference.slice(0, 7));
		if (!nominal) throw new Error("Não foi possível identificar o calendário da fatura");
		return {
			dueDate: dates.dueDate ?? nominal.dueDate,
			statementDate: dates.statementDate ?? nominal.statementDate,
		};
	}
	return {
		dueDate: dates.dueDate ?? cycle.dueDate,
		statementDate: dates.statementDate ?? cycle.statementDate,
	};
}

/** Apply a next-cycle date without marking it synchronized or changing the current invoice. */
export function synchronizeNextImportedStatement(
	book: CreditBook,
	nextStatementDate: string,
	currentStatementDate: string,
) {
	const confirmed = book.statements
		.filter(item => item.isFullySynced && item.statementDate > currentStatementDate)
		.toSorted((a, b) => a.statementDate.localeCompare(b.statementDate))[0];
	if (confirmed) return confirmed;
	if (nextStatementDate <= currentStatementDate)
		throw new RangeError("Fechamento da próxima fatura deve ser posterior ao fechamento atual");
	const pending = book.statements.filter(
		item =>
			!item.isFullySynced &&
			item.statementDate > currentStatementDate &&
			item.statementDate.slice(0, 7) === nextStatementDate.slice(0, 7),
	);
	if (pending.length === 1)
		return synchronizeImportedStatementDates(
			book,
			{ dueDate: pending[0]!.dueDate, statementDate: nextStatementDate },
			pending[0]!.id,
		);
	return synchronizeImportedStatementDates(
		book,
		resolveImportStatementDates({ statementDate: nextStatementDate }, book),
	);
}
