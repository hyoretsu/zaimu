import { createFileRoute } from "@tanstack/react-router";
import { LoanComparisonPage } from "./components";

export interface LoanComparisonSearch {
	from?: string;
	loan?: string;
	offers?: string;
}

const optionalString = (value: unknown) => (typeof value === "string" ? value : undefined);

export const Route = createFileRoute("/tools/loan-comparison")({
	component: LoanComparisonPage,
	validateSearch: (search: Record<string, unknown>): LoanComparisonSearch => ({
		from: optionalString(search.from),
		loan: optionalString(search.loan),
		offers: optionalString(search.offers),
	}),
});
