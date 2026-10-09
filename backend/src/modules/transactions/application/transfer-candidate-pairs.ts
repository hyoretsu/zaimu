import { transferSuggestionTimeSeconds } from "~/modules/transaction-imports/domain/transfer-suggestions";

interface Candidate {
	amount: number;
	date: Date | string;
	destinationFinancialAccountId: string | null;
	id: string;
	originFinancialAccountId: string | null;
	time?: string | null;
	type: string;
}

/** Preserve original pair order while visiting only compatible time/value buckets. */
export function transferCandidatePairs<T extends Candidate>(candidates: T[], rejected: ReadonlySet<string>) {
	const buckets = new Map<string, Map<string | null, number[]>>();
	const times = candidates.map(candidate => transferSuggestionTimeSeconds(candidate.time));
	const dates = candidates.map((candidate, index) =>
		times[index] === null ? null : new Date(candidate.date).toISOString().slice(0, 10),
	);
	const key = (date: string, amount: number, type: string, minute: number) =>
		JSON.stringify([date, amount, type, minute]);
	for (let index = 0; index < candidates.length; index++) {
		const candidate = candidates[index]!;
		if (
			times[index] === null ||
			!Number.isFinite(candidate.amount) ||
			!["INCOME", "EXPENSE"].includes(candidate.type)
		)
			continue;
		const bucketKey = key(dates[index]!, candidate.amount, candidate.type, Math.floor(times[index]! / 60));
		const bucket = buckets.get(bucketKey) ?? new Map<string | null, number[]>();
		const account =
			candidate.type === "INCOME"
				? candidate.destinationFinancialAccountId
				: candidate.originFinancialAccountId;
		const indexes = bucket.get(account) ?? [];
		indexes.push(index);
		bucket.set(account, indexes);
		buckets.set(bucketKey, bucket);
	}
	const result: { transaction: T; counterpart: T }[] = [];
	for (let index = 0; index < candidates.length; index++) {
		const transaction = candidates[index]!;
		const time = times[index];
		if (time === null || time === undefined || !["INCOME", "EXPENSE"].includes(transaction.type)) continue;
		const opposite = transaction.type === "INCOME" ? "EXPENSE" : "INCOME";
		const minute = Math.floor(time / 60);
		const account =
			transaction.type === "INCOME"
				? transaction.destinationFinancialAccountId
				: transaction.originFinancialAccountId;
		const matching = [-1, 0, 1]
			.flatMap(offset =>
				[...(buckets.get(key(dates[index]!, transaction.amount, opposite, minute + offset)) ?? [])]
					.filter(([otherAccount]) => otherAccount !== account)
					.flatMap(([, indexes]) => indexes),
			)
			.filter(candidateIndex => candidateIndex > index)
			.sort((a, b) => a - b);
		for (const counterpartIndex of matching) {
			const counterpart = candidates[counterpartIndex]!;
			const counterpartAccount =
				counterpart.type === "INCOME"
					? counterpart.destinationFinancialAccountId
					: counterpart.originFinancialAccountId;
			if (account === counterpartAccount || Math.abs(time - times[counterpartIndex]!) > 60) continue;
			if (!rejected.has([transaction.id, counterpart.id].sort().join(":")))
				result.push({ counterpart, transaction });
		}
	}
	return result;
}
