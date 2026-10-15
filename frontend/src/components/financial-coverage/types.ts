export interface CoverageItem {
	id: string;
	kind: string;
	name: string;
	source: string;
	version: string | null;
	startDate: string | null;
	endDate: string | null;
	status: string;
	countryCode: string | null;
	affectedAccountIds: string[];
	gaps: { startDate: string; endDate: string }[];
}
