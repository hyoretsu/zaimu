import { expect, test } from "bun:test";
import type { DebtEvent } from "@/lib/api";
import { groupDebtEventsByMonth } from "./group-debt-events";

const event = (id: string, date: string | null, time: string | null = null): DebtEvent => ({
	amount: 1,
	createdByMe: true,
	createdByName: "Você",
	createdByUserId: "user-id",
	date,
	description: id,
	effect: -1,
	id,
	kind: "TRANSACTION",
	time,
});

test("agrupa páginas pelo mês local, em ordem decrescente, com lançamentos sem data no fim", () => {
	const pages = [
		[event("sem data", null), event("mais antigo", "2025-12-31")],
		[event("manhã", "2026-01-01", "08:00"), event("noite", "2026-01-01", "20:00")],
	];
	const events = pages.flat();
	const groups = groupDebtEventsByMonth(events);
	expect(groups.map(group => group.key)).toEqual(["2026-01", "2025-12", "undated"]);
	expect(groups.map(group => group.title)).toEqual(["janeiro de 2026", "dezembro de 2025", "Sem data"]);
	expect(groups[0].events.map(event => event.id)).toEqual(["noite", "manhã"]);
	expect(events[0].id).toBe("sem data");
});

test("não cria grupos para uma listagem vazia", () => {
	expect(groupDebtEventsByMonth([])).toEqual([]);
});
