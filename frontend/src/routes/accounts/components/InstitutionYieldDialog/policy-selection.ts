import type { FinancialInstitutionYieldPolicy } from "@/lib/api";

export const policyDay = (value: string) => value.slice(0, 10);

/** Approved periods of one exact scope, oldest first; legacy currency filters stay respected. */
export function policyTimeline(
	policies: FinancialInstitutionYieldPolicy[],
	profileId: string | undefined,
	countryCode: string | undefined,
	currency: string,
) {
	return policies
		.filter(
			policy =>
				policy.profileId === profileId &&
				(policy.countryCode ?? undefined) === countryCode &&
				(!policy.status || policy.status === "APPROVED") &&
				(policy.currency === null || (policy.currency ?? "BRL") === currency),
		)
		.toSorted((left, right) =>
			policyDay(left.effectiveDate).localeCompare(policyDay(right.effectiveDate)),
		);
}

/** Editing uses the exact country scope; inherited general rules remain separate. */
export function selectEditablePolicy(
	policies: FinancialInstitutionYieldPolicy[],
	profileId: string | undefined,
	countryCode: string | undefined,
	effectiveDate: string,
	currency: string,
) {
	return policies
		.filter(
			policy =>
				policy.profileId === profileId &&
				(policy.countryCode ?? undefined) === countryCode &&
				(!policy.status || policy.status === "APPROVED") &&
				policy.effectiveDate.slice(0, 10) <= effectiveDate &&
				(!policy.effectiveUntil || effectiveDate < policy.effectiveUntil.slice(0, 10)) &&
				(policy.currency === null || (policy.currency ?? "BRL") === currency),
		)
		.toSorted(
			(left, right) =>
				left.effectiveDate.localeCompare(right.effectiveDate) ||
				Number(left.currency === null) - Number(right.currency === null),
		)
		.at(-1);
}

/** Start stored for periods without an explicit start: covers the whole previous period. */
export const OPEN_START = "1970-01-01";

/** Start date to show in the picker; the open-start sentinel is shown as blank. */
export function visibleStart(effectiveDate: string) {
	const day = policyDay(effectiveDate);
	return day === OPEN_START ? "" : day;
}
