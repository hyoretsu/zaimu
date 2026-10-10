import type { CreditBook } from "./credit-book";

const prefix = "Parcelamento - ";
const tagsKey = (tags: readonly string[]) => JSON.stringify([...new Set(tags)].sort());

/** Relations use the persisted settlement foreign key, never the purchase description. */
export function bookRefinancingLinks(book: CreditBook) {
	const purchases = new Map(book.purchases.map(p => [p.id, p]));
	const parents = new Map<string, string>();
	const children = new Map<string, Set<string>>();
	for (const installment of book.installments) {
		const target = installment.settledByPurchaseId;
		if (!target) continue;
		if (!purchases.has(target) || !purchases.has(installment.purchaseId))
			throw new RangeError("Compra vinculada ao reparcelamento não encontrada");
		const parent = parents.get(target);
		if (parent && parent !== installment.purchaseId)
			throw new RangeError("Reparcelamento deve pertencer a uma única compra");
		parents.set(target, installment.purchaseId);
		const group = children.get(installment.purchaseId) ?? new Set<string>();
		group.add(target);
		children.set(installment.purchaseId, group);
	}
	return new Map(
		book.purchases.map(p => {
			const seen = new Set<string>();
			let originalId = p.id;
			while (parents.has(originalId)) {
				if (seen.has(originalId)) throw new RangeError("Vínculo circular de reparcelamento");
				seen.add(originalId);
				originalId = parents.get(originalId)!;
			}
			const from = parents.get(p.id) ?? null;
			const targets = [...(children.get(p.id) ?? [])];
			return [
				p.id,
				{
					refinancedFromPurchaseId: from,
					refinancingOriginalPurchaseId: from || targets.length ? originalId : null,
					refinancingPurchaseIds: targets,
				},
			] as const;
		}),
	);
}

/** Shared names/tags propagate both ways; financial conditions and times stay independent. */
export function synchronizeBookRefinancing(book: CreditBook, previous?: CreditBook) {
	const links = bookRefinancingLinks(book);
	const purchases = new Map(book.purchases.map(p => [p.id, p]));
	const oldPurchases = new Map(previous?.purchases.map(p => [p.id, p]) ?? []);
	if (previous) {
		for (const [id, relation] of bookRefinancingLinks(previous)) {
			for (const target of relation.refinancingPurchaseIds) {
				if (!purchases.has(id) && !purchases.has(target)) continue;
				if (
					!purchases.has(id) ||
					!purchases.has(target) ||
					!links.get(id)?.refinancingPurchaseIds.includes(target)
				)
					throw new RangeError(
						"Compra e reparcelamento vinculados não podem ser excluídos ou desvinculados separadamente",
					);
			}
		}
	}
	const families = Map.groupBy(
		book.purchases.filter(p => links.get(p.id)?.refinancingOriginalPurchaseId),
		p => links.get(p.id)!.refinancingOriginalPurchaseId!,
	);
	for (const [id, family] of families) {
		const original = purchases.get(id)!;
		const changedName = family.filter(
			p => oldPurchases.has(p.id) && oldPurchases.get(p.id)!.description !== p.description,
		);
		const changedTags = family.filter(
			p => oldPurchases.has(p.id) && tagsKey(oldPurchases.get(p.id)!.tagIds) !== tagsKey(p.tagIds),
		);
		const names = new Set(
			changedName.map(p =>
				links.get(p.id)!.refinancedFromPurchaseId && p.description.startsWith(prefix)
					? p.description.slice(prefix.length)
					: p.description,
			),
		);
		const tags = new Set(changedTags.map(p => tagsKey(p.tagIds)));
		if (names.size > 1 || tags.size > 1)
			throw new RangeError("Alterações conflitantes entre compra e reparcelamento");
		const name = [...names][0] ?? original.description;
		const tagIds = [...new Set(changedTags[0]?.tagIds ?? original.tagIds)];
		for (const purchase of family) {
			const description = links.get(purchase.id)!.refinancedFromPurchaseId ? `${prefix}${name}` : name;
			if (purchase.description !== description || tagsKey(purchase.tagIds) !== tagsKey(tagIds)) {
				purchase.description = description;
				purchase.tagIds = [...tagIds];
				purchase.updatedAt = new Date().toISOString();
			}
		}
	}
}

export function assertBookPurchaseCanMove(book: CreditBook, purchaseId: string) {
	const relation = bookRefinancingLinks(book).get(purchaseId);
	if (relation?.refinancingOriginalPurchaseId)
		throw new RangeError("Compra e reparcelamento vinculados devem permanecer no mesmo cartão");
}
