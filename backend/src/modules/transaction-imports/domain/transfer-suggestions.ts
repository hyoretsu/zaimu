export type TransferSuggestionItemType = "EXPENSE" | "INCOME" | "TRANSFER" | "YIELD";

export interface TransferSuggestionItem {
	amount: number;
	date: Date | string;
	externalId: string | null;
	financialAccountId: string;
	id: string;
	source: "IMPORT_ITEM" | "TRANSACTION";
	time?: string | null;
	type: TransferSuggestionItemType;
	transferCounterpartExternalId?: string | null;
}

export interface TransferSuggestionRejection {
	incomingExternalId: string;
	incomingFinancialAccountId: string;
	outgoingExternalId: string;
	outgoingFinancialAccountId: string;
}

export interface TransferSuggestion<Item extends TransferSuggestionItem = TransferSuggestionItem> {
	incoming: Item;
	outgoing: Item;
}

const dateKey = (value: Date | string) => new Date(value).toISOString().slice(0, 10);

const timePattern = /^(?<hours>[01]\d|2[0-3]):(?<minutes>[0-5]\d)(?::(?<seconds>[0-5]\d))?$/;

export function transferSuggestionTimeSeconds(value: string | null | undefined) {
	const match = value?.match(timePattern);
	if (!match?.groups) return null;
	return (
		Number(match.groups.hours) * 3_600 + Number(match.groups.minutes) * 60 + Number(match.groups.seconds ?? 0)
	);
}

export function areTransferSuggestionTimesCompatible(
	left: Pick<TransferSuggestionItem, "date" | "time">,
	right: Pick<TransferSuggestionItem, "date" | "time">,
) {
	if (dateKey(left.date) !== dateKey(right.date)) return false;
	const leftTime = transferSuggestionTimeSeconds(left.time);
	const rightTime = transferSuggestionTimeSeconds(right.time);
	return leftTime !== null && rightTime !== null && Math.abs(leftTime - rightTime) <= 60;
}

export function transferSuggestionRejectionKey(rejection: TransferSuggestionRejection) {
	return JSON.stringify([
		rejection.outgoingFinancialAccountId,
		rejection.outgoingExternalId,
		rejection.incomingFinancialAccountId,
		rejection.incomingExternalId,
	]);
}

export function getTransferSuggestionPair<Item extends TransferSuggestionItem>(
	left: Item,
	right: Item,
): TransferSuggestion<Item> | null {
	if (!left.externalId || !right.externalId) return null;
	if (left.financialAccountId === right.financialAccountId) return null;
	if (left.transferCounterpartExternalId || right.transferCounterpartExternalId) return null;
	if (Number(left.amount) !== Number(right.amount) || !areTransferSuggestionTimesCompatible(left, right))
		return null;
	if (left.type === "EXPENSE" && right.type === "INCOME") return { incoming: right, outgoing: left };
	if (left.type === "INCOME" && right.type === "EXPENSE") return { incoming: left, outgoing: right };
	return null;
}

export function getTransferSuggestions<Item extends TransferSuggestionItem>(
	item: Item,
	candidates: Item[],
	rejectedPairs: ReadonlySet<string>,
) {
	return candidates.flatMap(candidate => {
		if (candidate.id === item.id) return [];
		if (item.source !== "IMPORT_ITEM" || candidate.source !== "TRANSACTION") return [];
		const pair = getTransferSuggestionPair(item, candidate);
		if (!pair?.outgoing.externalId || !pair.incoming.externalId) return [];
		return rejectedPairs.has(
			transferSuggestionRejectionKey({
				incomingExternalId: pair.incoming.externalId,
				incomingFinancialAccountId: pair.incoming.financialAccountId,
				outgoingExternalId: pair.outgoing.externalId,
				outgoingFinancialAccountId: pair.outgoing.financialAccountId,
			}),
		)
			? []
			: [pair];
	});
}
