interface Candidate {
	amount: number | string;
	date: Date | string;
	externalIds: readonly string[];
}
const dateAmountKey = (value: Pick<Candidate, "amount" | "date">) =>
	`${new Date(value.date).toISOString().slice(0, 10)}:${Number(value.amount)}`;

export function indexDuplicateCandidates<T extends Candidate>(candidates: readonly T[]) {
	const byExternalId = new Map<string, T[]>();
	const byDateAmount = new Map<string, T[]>();
	for (const candidate of candidates) {
		const key = dateAmountKey(candidate);
		const dated = byDateAmount.get(key) ?? [];
		dated.push(candidate);
		byDateAmount.set(key, dated);
		for (const id of new Set(candidate.externalIds)) {
			const external = byExternalId.get(id) ?? [];
			external.push(candidate);
			byExternalId.set(id, external);
		}
	}
	return {
		dated: (item: Pick<Candidate, "amount" | "date">) => byDateAmount.get(dateAmountKey(item)) ?? [],
		external: (id: string) => byExternalId.get(id) ?? [],
	};
}
