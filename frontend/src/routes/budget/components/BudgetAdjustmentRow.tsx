import { LuPencil, LuUndo2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { MonthlyBudget } from "@/lib/monthly-budget-service";
import { budgetMoney } from "./budget-display";

export function BudgetAdjustmentRow({
	item,
	adjustment,
	pending,
	onEdit,
	onRestore,
}: {
	item: MonthlyBudget;
	adjustment?: MonthlyBudget;
	pending: boolean;
	onEdit: () => void;
	onRestore: () => void;
}) {
	return (
		<li className="flex min-w-0 flex-wrap items-center justify-between gap-3 py-3">
			<div className="min-w-0 flex-1">
				<h3 className="truncate font-medium">{item.name}</h3>
				<p className="text-muted-foreground text-xs">
					{adjustment ? `Padrão: ${budgetMoney(item.amount, item.currency)}` : "Usando plano geral"}
				</p>
			</div>
			<span className="font-semibold tabular-nums">
				{budgetMoney(adjustment?.amount ?? item.amount, item.currency)}
			</span>
			<ActionGroup>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Ajustar ${item.name}`}
							disabled={pending}
							onClick={onEdit}
							size="icon-sm"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Ajustar valor neste mês</TooltipContent>
				</Tooltip>
				{adjustment && (
					<Tooltip>
						<TooltipTrigger asChild>
							<span>
								<ConfirmActionButton
									aria-label={`Restaurar padrão de ${item.name}`}
									confirmation="Descartar ajuste e restaurar valor padrão?"
									disabled={pending}
									onConfirm={onRestore}
									size="icon-sm"
									variant="outline"
								>
									<LuUndo2 />
								</ConfirmActionButton>
							</span>
						</TooltipTrigger>
						<TooltipContent>Restaurar valor padrão</TooltipContent>
					</Tooltip>
				)}
			</ActionGroup>
		</li>
	);
}
