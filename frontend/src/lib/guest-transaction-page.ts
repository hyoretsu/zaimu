import type { Transaction } from "./api";

interface PageInput {
	cursor?: string;
	limit?: number;
	[key: string]: unknown;
}
const position = (row: Transaction) =>
	[row.date.slice(0, 10), row.createdAt ?? "", row.source === "CREDIT_CARD" ? 1 : 0, row.id] as const;
const compare = (left: ReturnType<typeof position>, right: ReturnType<typeof position>) =>
	left[0].localeCompare(right[0]) ||
	left[1].localeCompare(right[1]) ||
	left[2] - right[2] ||
	left[3].localeCompare(right[3]);

export function guestTransactionPage(rows: Transaction[], owner: string, input: PageInput) {
	const { cursor, limit = 50, ...filters } = input;
	if (!Number.isInteger(limit) || limit < 1 || limit > 100) throw new Error("Limite inválido");
	const hash = JSON.stringify({
		filters: Object.fromEntries(Object.entries(filters).sort(([a], [b]) => a.localeCompare(b))),
		owner,
	});
	let boundary: ReturnType<typeof position> | undefined;
	if (cursor) {
		try {
			const parsed = JSON.parse(decodeURIComponent(atob(cursor)));
			if (
				parsed.hash !== hash ||
				!Array.isArray(parsed.position) ||
				parsed.position.length !== 4 ||
				typeof parsed.position[0] !== "string" ||
				typeof parsed.position[1] !== "string" ||
				![0, 1].includes(parsed.position[2]) ||
				typeof parsed.position[3] !== "string"
			)
				throw new Error();
			boundary = parsed.position;
		} catch {
			throw new Error("Cursor inválido para estes filtros");
		}
	}
	const selected = rows
		.filter(row => !boundary || compare(position(row), boundary) < 0)
		.toSorted((a, b) => compare(position(b), position(a)))
		.slice(0, limit + 1);
	const hasMore = selected.length > limit;
	const items = selected
		.slice(0, limit)
		.map(({ debtSplit, externalIds, ...row }) => ({
			...row,
			debtSplitSummary: debtSplit
				? {
						ownerAmount: debtSplit.ownerAmount,
						participants: debtSplit.participants.map(({ amount, debtPersonName }) => ({
							amount,
							debtPersonName,
						})),
					}
				: (row.debtSplitSummary ?? null),
			isSynced: row.isSynced ?? Boolean(externalIds?.length),
		}));
	return {
		hasMore,
		items,
		nextCursor: hasMore
			? btoa(encodeURIComponent(JSON.stringify({ hash, position: position(selected[limit - 1]!) })))
			: null,
	};
}
