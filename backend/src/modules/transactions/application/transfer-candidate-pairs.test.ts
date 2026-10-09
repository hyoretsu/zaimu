import { expect, test } from "bun:test";
import { areTransferSuggestionTimesCompatible } from "~/modules/transaction-imports/domain/transfer-suggestions";
import { transferCandidatePairs } from "./transfer-candidate-pairs";

const candidate = (id: number, type = "EXPENSE", time: string | null = null, account = "a") => ({
	amount: 10,
	date: "2026-10-04",
	destinationFinancialAccountId: type === "INCOME" ? account : null,
	id: String(id),
	originFinancialAccountId: type === "EXPENSE" ? account : null,
	time,
	type,
});

test("indexed transfers preserve time boundaries, rejections, account exclusion and pair order", () => {
	const rows = [
		candidate(0, "INCOME", "12:01:00", "b"),
		candidate(1, "EXPENSE", "12:00:00"),
		candidate(2, "EXPENSE", "12:02:01"),
		candidate(3, "EXPENSE", "12:01:00", "b"),
		candidate(4, "EXPENSE", "12:01:59"),
		candidate(5, "INCOME", null, "c"),
		{ ...candidate(6, "EXPENSE", "12:01:00"), amount: 11 },
		{ ...candidate(7, "EXPENSE", "12:01:00"), date: "2026-10-05" },
		candidate(8, "INCOME", "12:00:30", "c"),
	];
	const rejected = new Set(["0:4"]);
	const reference = rows.flatMap((transaction, index) =>
		rows.slice(index + 1).flatMap(counterpart => {
			const account =
				transaction.type === "INCOME"
					? transaction.destinationFinancialAccountId
					: transaction.originFinancialAccountId;
			const otherAccount =
				counterpart.type === "INCOME"
					? counterpart.destinationFinancialAccountId
					: counterpart.originFinancialAccountId;
			return transaction.type !== counterpart.type &&
				transaction.amount === counterpart.amount &&
				account !== otherAccount &&
				areTransferSuggestionTimesCompatible(transaction, counterpart) &&
				!rejected.has([transaction.id, counterpart.id].sort().join(":"))
				? [{ counterpart, transaction }]
				: [];
		}),
	);
	expect(reference).toHaveLength(3);
	expect(transferCandidatePairs(rows, rejected)).toEqual(reference);
});

test("10/10k/100k history avoids pairing records without compatible time/value", () => {
	for (const size of [10, 10000, 100000]) {
		const rows = Array.from({ length: size }, (_, index) => candidate(index));
		rows.push(candidate(size, "EXPENSE", "23:59:00"), candidate(size + 1, "INCOME", "23:59:59", "b"));
		expect(transferCandidatePairs(rows, new Set())).toEqual([
			{ counterpart: rows[size + 1], transaction: rows[size] },
		]);
	}
}, 30000);

test("dense same-account timestamps do not require comparing opposite movements", () => {
	const rows = Array.from({ length: 100000 }, (_, index) =>
		candidate(index, index % 2 ? "INCOME" : "EXPENSE", "12:00:00"),
	);
	expect(transferCandidatePairs(rows, new Set())).toEqual([]);
}, 30000);
