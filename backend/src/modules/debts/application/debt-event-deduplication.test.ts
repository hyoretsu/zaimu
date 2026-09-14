import { describe, expect, test } from "bun:test";
import {
	getDuplicateCreatorDebtEventIds,
	removeDuplicateSourcedDebtEvents,
} from "./debt-event-deduplication";

describe("deduplicação de eventos de dívida", () => {
	test("mantém um evento criador por pessoa e lançamento de origem", () => {
		const events = [
			{ createdByUserId: "user", debtPersonId: "person", id: "first" },
			{ createdByUserId: "user", debtPersonId: "person", id: "duplicate" },
			{ createdByUserId: "user", debtPersonId: "other-person", id: "other-person" },
			{ createdByUserId: "user", debtPersonId: "person", id: "other-source" },
		];
		const sourceByEventId = new Map([
			["first", "transaction:one"],
			["duplicate", "transaction:one"],
			["other-person", "transaction:one"],
			["other-source", "transaction:two"],
		]);

		expect(removeDuplicateSourcedDebtEvents(events, sourceByEventId).map(event => event.id)).toEqual([
			"first",
			"other-person",
			"other-source",
		]);
	});

	test("marca somente links criadores repetidos para a mesma pessoa", () => {
		expect(
			getDuplicateCreatorDebtEventIds([
				{ debtPersonId: "person", eventId: "first", isCreator: true },
				{ debtPersonId: "person", eventId: "duplicate", isCreator: true },
				{ debtPersonId: "person", eventId: "matched", isCreator: false },
				{ debtPersonId: "other-person", eventId: "other", isCreator: true },
			]),
		).toEqual(new Set(["duplicate"]));
	});
});
