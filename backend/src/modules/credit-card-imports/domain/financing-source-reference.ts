const sourceReference = / \[financing-source:(credit-card:v1:[a-f\d]{64})\]$/u;
const targetReference = / \[financing-target:(credit-card:v1:[a-f\d]{64})\]$/u;
const financedOperation = /^FIN\s+(.+?)\s+·\s+IOF R\$\s+([\d.]+,\d{2})$/u;

export function withFinancingSource(description: string, externalId: string) {
	return `${description} [financing-source:${externalId}]`;
}

export function getFinancingSource(description: string) {
	return description.match(sourceReference)?.[1] ?? null;
}

export function withoutFinancingSource(description: string) {
	return description.replace(sourceReference, "");
}

export function withFinancingTarget(description: string, externalId: string) {
	return `${description} [financing-target:${externalId}]`;
}

export function getFinancingTarget(description: string) {
	return description.match(targetReference)?.[1] ?? null;
}

export function withoutFinancingReferences(description: string) {
	return description.replace(sourceReference, "").replace(targetReference, "");
}

export function preserveFinancedOperation(originalDescription: string, editedDescription: string) {
	const original = withoutFinancingReferences(originalDescription).match(financedOperation);
	if (!original) return withoutFinancingReferences(editedDescription);
	const edited = withoutFinancingReferences(editedDescription).match(financedOperation);
	const merchant = (edited?.[1] ?? withoutFinancingReferences(editedDescription)).trim() || original[1]!;
	return `FIN ${merchant} · IOF R$ ${original[2]}`;
}
