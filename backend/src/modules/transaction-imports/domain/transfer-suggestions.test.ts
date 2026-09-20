import { describe, expect, test } from "bun:test";
import {
	getTransferSuggestionPair,
	getTransferSuggestions,
	type TransferSuggestionItem,
	transferSuggestionRejectionKey,
} from "./transfer-suggestions";

const outgoing: TransferSuggestionItem = {
	amount: 42.5,
	date: "2026-09-10",
	externalId: "outgoing-id",
	financialAccountId: "account-a",
	id: "outgoing-item",
	source: "IMPORT_ITEM",
	type: "EXPENSE",
};
const incoming: TransferSuggestionItem = {
	amount: 42.5,
	date: "2026-09-11",
	externalId: "incoming-id",
	financialAccountId: "account-b",
	id: "incoming-item",
	source: "TRANSACTION",
	type: "INCOME",
};

describe("getTransferSuggestionPair", () => {
	test("matches opposite movements of equal value at most one minute apart", () => {
		expect(
			getTransferSuggestionPair(
				{ ...outgoing, time: "13:29" },
				{ ...incoming, date: "2026-09-10", time: "13:30" },
			),
		).toEqual({
			incoming: { ...incoming, date: "2026-09-10", time: "13:30" },
			outgoing: { ...outgoing, time: "13:29" },
		});
	});

	test("does not match movements in the same account, without a time, or more than one minute apart", () => {
		expect(
			getTransferSuggestionPair(
				{ ...outgoing, time: "13:29" },
				{ ...incoming, date: "2026-09-10", financialAccountId: outgoing.financialAccountId, time: "13:30" },
			),
		).toBeNull();
		expect(
			getTransferSuggestionPair(outgoing, { ...incoming, date: "2026-09-10", time: "13:30" }),
		).toBeNull();
		expect(
			getTransferSuggestionPair(
				{ ...outgoing, time: "13:29" },
				{ ...incoming, date: "2026-09-10", time: "13:30:01" },
			),
		).toBeNull();
		expect(
			getTransferSuggestionPair({ ...outgoing, time: "13:29" }, { ...incoming, time: "13:30" }),
		).toBeNull();
	});
});

describe("getTransferSuggestions", () => {
	test("only suggests materialized transactions for an import item", () => {
		expect(getTransferSuggestions(outgoing, [{ ...incoming, source: "IMPORT_ITEM" }], new Set())).toEqual([]);
		expect(getTransferSuggestions({ ...outgoing, source: "TRANSACTION" }, [incoming], new Set())).toEqual([]);
		const timedOutgoing = { ...outgoing, time: "13:29" };
		const timedIncoming = { ...incoming, date: "2026-09-10", time: "13:30" };
		expect(getTransferSuggestions(timedOutgoing, [timedIncoming], new Set())).toEqual([
			{ incoming: timedIncoming, outgoing: timedOutgoing },
		]);
	});

	test("omits a rejected pair", () => {
		const rejected = new Set([
			transferSuggestionRejectionKey({
				incomingExternalId: incoming.externalId!,
				incomingFinancialAccountId: incoming.financialAccountId,
				outgoingExternalId: outgoing.externalId!,
				outgoingFinancialAccountId: outgoing.financialAccountId,
			}),
		]);
		expect(getTransferSuggestions(outgoing, [incoming], rejected)).toEqual([]);
	});
});
