import { LuPencil, LuUndo2, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Badge } from "@/components/ui/Badge";
import { Button } from "@/components/ui/Button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { type PolicyLike, policyPeriod, policyScope, policyTiers } from "./policy-summary";

/** Compact read-only policy summary with its edit action; every row also gets a discard (drafts), remove (approved) or restore (removed) action. */
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
	status?: "changed" | "new" | "removed";
}) {
	const scope = policyScope(policy);
	const actionLabel =
		status === "removed" ? "Desfazer remoção" : status ? "Descartar alteração" : "Remover política";
	return (
		<li className="flex min-w-0 items-center gap-3 rounded-lg border px-3 py-2">
			<div className="min-w-0 flex-1 space-y-0.5 text-sm">
				<div className="flex flex-wrap items-center gap-2">
					<p className="font-medium break-words">{scope}</p>
					{status && (
						<Badge variant={status === "removed" ? "destructive" : undefined}>
							{status === "new" ? "Nova" : status === "removed" ? "Removida" : "Alterada"}
						</Badge>
					)}
				</div>
				<p className="text-muted-foreground break-words">
					{policyPeriod(policy)} · {policyTiers(policy).join(" · ")}
				</p>
			</div>
			<ActionGroup className="shrink-0 flex-nowrap">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Editar política de ${scope}`}
							disabled={disabled || status === "removed"}
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
								aria-label={`${actionLabel} de ${scope}`}
								disabled={disabled}
								onClick={onRemove}
								size="icon-sm"
								type="button"
								variant="outline"
							>
								{status === "removed" ? <LuUndo2 /> : <LuX />}
							</Button>
						</TooltipTrigger>
						<TooltipContent>{actionLabel}</TooltipContent>
					</Tooltip>
				)}
			</ActionGroup>
		</li>
	);
}
