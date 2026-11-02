import type { FinancialInstitutionYieldPolicy } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

const day = (value: string) => value.slice(0, 10);

function summarize(policy: FinancialInstitutionYieldPolicy) {
	const rules = policy.rules ?? [];
	if (rules.length === 0) return "Sem rendimento";
	return rules
		.map(rule =>
			rule.yieldFixedRate
				? `${Number(rule.yieldFixedRate)}% a.a.`
				: `${Number(rule.yieldReferencePercentage ?? 100)}% ${rule.yieldReferenceType ?? ""}`.trim(),
		)
		.join(" · ");
}

export function InstitutionYieldTimeline({
	policies,
	profileId,
	countryCode,
	currency,
}: {
	policies: FinancialInstitutionYieldPolicy[];
	profileId?: string;
	countryCode?: string;
	currency: string;
}) {
	const timeline = policies
		.filter(
			policy =>
				policy.profileId === profileId &&
				(policy.countryCode ?? undefined) === countryCode &&
				(!policy.status || policy.status === "APPROVED") &&
				(policy.currency === null || (policy.currency ?? "BRL") === currency),
		)
		.toSorted((left, right) => day(left.effectiveDate).localeCompare(day(right.effectiveDate)));
	if (timeline.length === 0) return null;
	return (
		<div className="grid gap-1">
			<p className="text-sm font-medium">Histórico de rendimentos</p>
			<ul className="grid gap-1 text-sm">
				{timeline.map(policy => (
					<li className="flex justify-between gap-4" key={policy.effectiveDate}>
						<span>
							{formatLocalDate(policy.effectiveDate)}
							{" → "}
							{policy.effectiveUntil ? formatLocalDate(policy.effectiveUntil) : "atual"}
						</span>
						<span className="text-muted-foreground">{summarize(policy)}</span>
					</li>
				))}
			</ul>
		</div>
	);
}
