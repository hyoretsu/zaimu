import { LuPencil, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { MonthlyBudget } from "@/lib/monthly-budget-service";
import { budgetMoney, budgetSourceLabel } from "./budget-display";

export function BudgetItem({
	item,
	pending,
	onEdit,
	onDelete,
}: {
	item: MonthlyBudget;
	pending: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<li className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] items-center gap-x-3 gap-y-2 px-4 py-3">
			<div className="min-w-0">
				<h3 className="truncate font-medium">{item.name}</h3>
				<p className="truncate text-muted-foreground text-xs">{budgetSourceLabel(item)}</p>
			</div>
			<div className="text-right">
				<p className="font-semibold tabular-nums">{budgetMoney(item.amount, item.currency)}</p>
				<p className="text-muted-foreground text-xs">por mês</p>
			</div>
			<ActionGroup>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Editar ${item.name}`}
							disabled={pending}
							onClick={onEdit}
							size="icon-sm"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Editar plano geral</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<ConfirmActionButton
								aria-label={`Excluir ${item.name}`}
								confirmation="Excluir planejamento permanentemente?"
								disabled={pending}
								onConfirm={onDelete}
								size="icon-sm"
								variant="outline"
							>
								<LuTrash2 />
							</ConfirmActionButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>Excluir</TooltipContent>
				</Tooltip>
			</ActionGroup>
		</li>
	);
}
