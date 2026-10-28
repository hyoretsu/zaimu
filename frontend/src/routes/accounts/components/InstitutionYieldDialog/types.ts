export interface EditableYieldRule {
	fixedRate: string;
	id: string;
	referencePercentage: string;
	referenceType: "" | "CDI" | "SELIC" | "IPCA" | "TR";
	upToBalance: string;
}
