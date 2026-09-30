import type { CreditCardStatement } from "./api";

export function ignoredThroughStatement(
	statements: CreditCardStatement[],
	ignoreStatementsBefore: string | null | undefined,
) {
	if (!ignoreStatementsBefore) return null;
	return (
		statements
			.filter(
				statement =>
					!statement.isForecast && statement.statementDate.slice(0, 10) < ignoreStatementsBefore.slice(0, 10),
			)
			.toSorted((a, b) => b.statementDate.localeCompare(a.statementDate))[0] ?? null
	);
}
