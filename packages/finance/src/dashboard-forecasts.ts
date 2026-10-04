import type { RecurrenceDefinition } from "./recurrence";

export function isCashFlowRecurrence(recurrence: Pick<RecurrenceDefinition, "movement">) {
	return recurrence.movement !== "CARD_PURCHASE" && recurrence.movement !== "TRANSFER";
}

export function dashboardCardForecasts(
	statements: Array<{ balanceAmount: number; creditCardId: string; dueDate: string; id: string }>,
	cards: Array<{ id: string; name: string | null; institutionName: string | null }>,
	today: string,
) {
	const cardsById = new Map(cards.map(card => [card.id, card]));
	return statements.flatMap(statement => {
		const card = cardsById.get(statement.creditCardId);
		const date = statement.dueDate.slice(0, 10);
		if (!card || date <= today || statement.balanceAmount <= 0) return [];
		return [
			{
				amount: statement.balanceAmount,
				date,
				direction: "EXPENSE" as const,
				id: `statement-${statement.id}`,
				name: card.name?.trim() || card.institutionName || "Cartão de crédito",
				sourceId: card.id,
				type: "CARD" as const,
			},
		];
	});
}
