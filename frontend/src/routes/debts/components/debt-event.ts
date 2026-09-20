import type { DebtEvent } from "@/lib/api";

const eventLabelCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function getDebtEventLabel(event: DebtEvent) {
	if (event.description) return event.description;
	if (event.kind === "PURCHASE") return "Compra";
	if (event.kind === "TRANSACTION") return event.effect < 0 ? "Recebimento" : "Pagamento";
	if (event.kind === "MIGRATED_SETTLEMENT") return "Quitação migrada";
	return "Lançamento manual";
}

export function getDebtEventCreatorLabel(event: DebtEvent) {
	if (event.createdByMe) return "Criado por você";

	const [firstName] = event.createdByName.trim().split(/\s+/);
	return `Criado por ${firstName}`;
}

export function compareDebtEventsByDateTimeThenLabel(left: DebtEvent, right: DebtEvent) {
	if (left.date && right.date) {
		const dateComparison = right.date.localeCompare(left.date);
		if (dateComparison) return dateComparison;
	} else if (left.date) {
		return -1;
	} else if (right.date) {
		return 1;
	}
	if (left.time && right.time) {
		const timeComparison = right.time.localeCompare(left.time);
		if (timeComparison) return timeComparison;
	} else if (left.time) {
		return -1;
	} else if (right.time) {
		return 1;
	}

	return eventLabelCollator.compare(getDebtEventLabel(left), getDebtEventLabel(right));
}
