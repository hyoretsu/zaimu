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
