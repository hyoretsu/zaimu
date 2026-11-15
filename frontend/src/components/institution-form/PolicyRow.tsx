import { LuPencil, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { type PolicyLike, policyPeriod, policyScope, policyTiers } from "./policy-summary";

/** Compact read-only policy summary with its edit action; drafts also get a discard action. */
export function PolicyRow({
	disabled,
	onEdit,
	onRemove,
	policy,
	status,
}: {
	disabled: boolean;
	onEdit: () => void;
	onRemove?: () => void;
	policy: PolicyLike;
	status?: "changed" | "new";
}) {
	const scope = policyScope(policy);
	return (
		<li className="flex min-w-0 items-start gap-3 rounded-lg border p-3">
			<div className="min-w-0 flex-1 space-y-1 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-medium break-words">{scope}</p>
					{status && <Badge>{status === "new" ? "Nova" : "Alterada"}</Badge>}
				</div>
				<p className="text-muted-foreground break-words">{policyPeriod(policy)}</p>
				{policyTiers(policy).map(line => (
					<p className="text-muted-foreground break-words" key={line}>
						{line}
					</p>
				))}
			</div>
			<ActionGroup className="shrink-0 flex-nowrap">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Editar política de ${scope}`}
							disabled={disabled}
							onClick={onEdit}
							size="icon-sm"
							type="button"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Editar política</TooltipContent>
				</Tooltip>
				{onRemove && (
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label={`Descartar alteração de ${scope}`}
								disabled={disabled}
								onClick={onRemove}
								size="icon-sm"
								type="button"
								variant="outline"
							>
								<LuX />
							</Button>
						</TooltipTrigger>
						<TooltipContent>Descartar alteração</TooltipContent>
					</Tooltip>
				)}
			</ActionGroup>
		</li>
	);
}
