export interface EditableYieldRule {
	fixedRate: string;
	id: string;
	referencePercentage: string;
	referenceType: "" | "CDI" | "SELIC";
	upToBalance: string;
}
