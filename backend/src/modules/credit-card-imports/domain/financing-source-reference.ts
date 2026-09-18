const sourceReference = / \[financing-source:(credit-card:v1:[a-f\d]{64})\]$/u;

export function withFinancingSource(description: string, externalId: string) {
	return `${description} [financing-source:${externalId}]`;
}

export function getFinancingSource(description: string) {
	return description.match(sourceReference)?.[1] ?? null;
}

export function withoutFinancingSource(description: string) {
	return description.replace(sourceReference, "");
}
