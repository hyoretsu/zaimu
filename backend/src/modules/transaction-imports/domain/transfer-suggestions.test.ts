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

	test("does not match movements in the same account, on different dates, or more than one minute apart", () => {
		expect(
			getTransferSuggestionPair(
				{ ...outgoing, time: "13:29" },
				{
					...incoming,
					date: "2026-09-10",
					financialAccountId: outgoing.financialAccountId,
					time: "13:30",
				},
			),
		).toBeNull();
		expect(
			getTransferSuggestionPair({ ...outgoing, time: "13:29" }, { ...incoming, date: "2026-09-11" }),
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

describe("getTransferSuggestionPair without times", () => {
	test("matches same-day opposite movements when either side has no time", () => {
		const pair = getTransferSuggestionPair(
			{ ...outgoing, time: null },
			{ ...incoming, date: outgoing.date, time: null },
		);
		expect(pair?.outgoing.id).toBe(outgoing.id);
		expect(pair?.incoming.id).toBe(incoming.id);
	});
});

describe("getTransferSuggestions", () => {
	test("suggests pending items of other imports and only for import items", () => {
		const pendingOutgoing = { ...outgoing, time: "13:29" };
		const pendingIncoming = {
			...incoming,
			date: "2026-09-10",
			source: "IMPORT_ITEM" as const,
			time: "13:30",
		};
		expect(getTransferSuggestions(pendingOutgoing, [pendingIncoming], new Set())).toEqual([
			{ incoming: pendingIncoming, outgoing: pendingOutgoing },
		]);
		expect(getTransferSuggestions(pendingIncoming, [pendingOutgoing], new Set())).toEqual([
			{ incoming: pendingIncoming, outgoing: pendingOutgoing },
		]);
		expect(getTransferSuggestions({ ...outgoing, source: "TRANSACTION" }, [incoming], new Set())).toEqual(
			[],
		);
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
