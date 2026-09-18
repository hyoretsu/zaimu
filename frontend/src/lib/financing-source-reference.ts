const sourceReference = / \[financing-source:credit-card:v1:[a-f\d]{64}\]$/u;

export function cleanFinancedDescription(description: string) {
	return description.replace(sourceReference, "");
}

export function hasFinancingSource(description: string) {
	return sourceReference.test(description);
}
