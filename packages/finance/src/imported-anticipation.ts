/** Compact import metadata, kept outside the merchant title and purchase identity. */
const marker = /\s*\[\[anticipated:([\d,:;]+)\]\]$/u;

export function importedAnticipation(description: string) {
	const match = description.match(marker);
	if (!match) return null;
	const installments = match[1]!.split(";").map(value => {
		const [number, amountCents] = value.split(":").map(Number);
		return { amountCents: amountCents!, number: number! };
	});
	if (
		installments.length < 2 ||
		installments.some(
			i =>
				!Number.isInteger(i.number) ||
				i.number < 1 ||
				!Number.isInteger(i.amountCents) ||
				i.amountCents <= 0,
		) ||
		new Set(installments.map(i => i.number)).size !== installments.length
	)
		return null;
	return installments;
}

export function withoutImportedAnticipation(description: string) {
	return description.replace(marker, "");
}

export function withImportedAnticipation(
	description: string,
	installments: { number: number; amountCents: number }[],
) {
	return `${withoutImportedAnticipation(description)} [[anticipated:${installments.map(i => `${i.number}:${i.amountCents}`).join(";")}]]`;
}

/** A full imported plan supplies its own original purchase without inventing missing installments. */
export function hasCompleteImportedPlan(description: string, installments: number) {
	const imported = importedAnticipation(description);
	return Boolean(
		Number.isInteger(installments) &&
			installments >= 2 &&
			imported?.length === installments &&
			imported.every(item => item.number <= installments),
	);
}

/** Match the final N installments of an N or N+1 purchase using exact cents. */
export function matchingAnticipatedTail(description: string, amounts: readonly number[]) {
	const parts = importedAnticipation(description);
	if (!parts || (amounts.length !== parts.length && amounts.length !== parts.length + 1)) return undefined;
	const start = amounts.length - parts.length;
	if (
		amounts.slice(start).reduce((sum, amount) => sum + amount, 0) !==
		parts.reduce((sum, part) => sum + part.amountCents, 0)
	)
		return undefined;
	return amounts.slice(start).map((_, index) => start + index + 1);
}

/** Refund evidence corrects the imported tail without treating it as a cancellation instruction. */
export function correctedRefundInstallments(description: string, amounts: readonly number[]) {
	const parts = importedAnticipation(description);
	if (!parts) return [...amounts];
	if (amounts.length < parts.length)
		throw new RangeError("Compra possui menos parcelas que o reembolso importado.");
	const ordered = parts.toSorted((a, b) => a.number - b.number);
	const start = amounts.length - ordered.length;
	return amounts.map((amount, index) => (index < start ? amount : ordered[index - start]!.amountCents));
}
