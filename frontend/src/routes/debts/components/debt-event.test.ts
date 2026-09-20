import { expect, test } from "bun:test";
import type { DebtEvent } from "@/lib/api";
import {
	compareDebtEventsByDateTimeThenLabel,
	getDebtEventCreatorLabel,
	getDebtEventLabel,
} from "./debt-event";

const event = (id: string, date: string, description: string, time: null | string = null): DebtEvent => ({
	amount: 1,
	createdByMe: true,
	createdByName: "Você",
	createdByUserId: "user-id",
	date,
	description,
	effect: -1,
	id,
	kind: "TRANSACTION",
	time,
});

test("ordena lançamentos da dívida por data, horário e descrição", () => {
	const events = [
		event("iphone", "2026-09-01", "iPhone 17", "18:30:00"),
		event("abafador", "2026-09-01", "Abafador de ruído", "20:15:00"),
		event("café", "2026-09-01", "Café"),
		event("água", "2026-08-03", "Água"),
	];

	expect(events.toSorted(compareDebtEventsByDateTimeThenLabel).map(getDebtEventLabel)).toEqual([
		"Abafador de ruído",
		"iPhone 17",
		"Café",
		"Água",
	]);
});

test("descreve quem criou o lançamento", () => {
	const ownEvent = event("mine", "2026-09-01", "Meu lançamento");
	const sharedEvent = {
		...event("shared", "2026-09-01", "Lançamento compartilhado"),
		createdByMe: false,
		createdByName: "Maria da Silva",
	};

	expect(getDebtEventCreatorLabel(ownEvent)).toBe("Criado por você");
	expect(getDebtEventCreatorLabel(sharedEvent)).toBe("Criado por Maria");
});
