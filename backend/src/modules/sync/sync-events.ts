import { createEventEnvelope } from "~/shared/application/events";

const domains: Record<string, string> = {
	categories: "category",
	creditBooks: "creditCard",
	creditCardStatements: "creditCard",
	creditCards: "creditCard",
	debtEvents: "debt",
	debtPeople: "debt",
	financialAccounts: "account",
	financialAccountYieldHolidays: "account",
	financialAccountYields: "account",
	loanPayments: "loan",
	loans: "loan",
	recurrenceOccurrences: "schedule",
	recurrences: "schedule",
	transactions: "transaction",
};
export function syncEvents(
	userId: string,
	results: Record<string, { synced: number }>,
	correlationId: string,
	affectedUserIds: string[] = [],
	inputs: Record<string, unknown> = {},
) {
	const changed = [
		...new Set(
			Object.entries(results)
				.filter(([, result]) => result.synced > 0)
				.map(([group]) => domains[group])
				.filter(Boolean),
		),
	];
	return changed.map(domain =>
		createEventEnvelope({
			aggregateId: userId,
			aggregateType: "sync",
			correlationId,
			eventType: "synchronized",
			payload: {
				aggregateIds: [
					...new Set(
						Object.entries(inputs)
							.filter(([group]) => domains[group] === domain)
							.flatMap(([, rows]) =>
								(Array.isArray(rows) ? rows : [])
									.map(row => String(row.id ?? row.card?.id ?? ""))
									.filter(Boolean),
							),
					),
				],
				domain,
			},
			userIds:
				domain === "debt" || domain === "creditCard" || domain === "transaction"
					? [...new Set([userId, ...affectedUserIds])]
					: [userId],
		}),
	);
}
