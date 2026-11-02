import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import type { FinancialInstitutionYieldPolicy } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";
import { cn } from "@/lib/utils";
import { OPEN_START, policyDay, policyTimeline } from "./policy-selection";

export function InstitutionYieldTimeline({
	policies,
	profileId,
	countryCode,
	currency,
	selectedStart,
	onSelect,
	onNew,
}: {
	policies: FinancialInstitutionYieldPolicy[];
	profileId?: string;
	countryCode?: string;
	currency: string;
	/** Start of the period being edited; `undefined` while a new period is being created. */
	selectedStart?: string;
	onSelect: (policy: FinancialInstitutionYieldPolicy) => void;
	onNew: () => void;
}) {
	const timeline = policyTimeline(policies, profileId, countryCode, currency);
	if (timeline.length === 0) return null;
	return (
		<div className="grid gap-2">
			<ul className="grid gap-1">
				{timeline.map(policy => {
					const start = policyDay(policy.effectiveDate);
					return (
						<li key={start}>
							<button
								aria-pressed={selectedStart === start}
								className={cn(
									"hover:bg-accent w-full rounded-md border px-3 py-2 text-left text-sm transition-colors",
									selectedStart === start && "border-primary bg-accent",
								)}
								onClick={() => onSelect(policy)}
								type="button"
							>
								{start === OPEN_START ? "Início" : formatLocalDate(start)}
								{" → "}
								{policy.effectiveUntil
									? formatLocalDate(policyDay(policy.effectiveUntil))
									: "atual"}
							</button>
						</li>
					);
				})}
			</ul>
			{selectedStart && (
				<Button
					className="justify-self-start"
					onClick={onNew}
					size="sm"
					type="button"
					variant="outline"
				>
					<LuPlus /> Novo período
				</Button>
			)}
		</div>
	);
}
