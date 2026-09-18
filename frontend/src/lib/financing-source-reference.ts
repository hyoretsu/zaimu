const sourceReference = / \[financing-source:credit-card:v1:[a-f\d]{64}\]$/u;
const targetReference = / \[financing-target:credit-card:v1:[a-f\d]{64}\]$/u;
const financedOperation = /^FIN\s+(.+?)\s+·\s+IOF R\$\s+([\d.]+,\d{2})$/u;

export function cleanFinancedDescription(description: string) {
	return description.replace(sourceReference, "").replace(targetReference, "");
}

export function hasFinancingSource(description: string) {
	return sourceReference.test(description);
}

export function hasFinancingTarget(description: string) {
	return targetReference.test(description);
}

export function getFinancedOperation(description: string) {
	const match = cleanFinancedDescription(description).match(financedOperation);
	return match ? { iof: match[2]!, merchant: match[1]! } : null;
}
