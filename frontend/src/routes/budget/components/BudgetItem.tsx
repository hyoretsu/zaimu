import type { ReactNode } from "react";
import { LuPencil, LuTrash2 } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { MonthlyBudget } from "@/lib/monthly-budget-service";
import { budgetSourceLabel } from "./budget-display";

export function BudgetItem({
	item,
	children,
	pending,
	onEdit,
	onDelete,
}: {
	item: MonthlyBudget;
	children?: ReactNode;
	pending: boolean;
	onEdit: () => void;
	onDelete: () => void;
}) {
	return (
		<li className="min-w-0">
			<div className="grid min-w-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 px-3 py-3 sm:grid-cols-[minmax(0,1fr)_auto_auto] sm:px-4">
				<div className="min-w-0">
					{item.name && <h3 className="truncate font-medium">{item.name}</h3>}
					<p className="truncate text-muted-foreground text-xs">{budgetSourceLabel(item)}</p>
				</div>
				<div className="text-right">
					<p className="font-semibold tabular-nums">
						<PreferredMoneyAmount values={[{ amount: item.amount, currency: item.currency }]} />
					</p>
					<p className="text-muted-foreground text-xs">por mês</p>
				</div>
				<ActionGroup className="col-span-2 sm:col-span-1">
					<Tooltip>
						<TooltipTrigger asChild>
							<Button
								aria-label={`Editar ${item.name || budgetSourceLabel(item)}`}
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
									aria-label={`Excluir ${item.name || budgetSourceLabel(item)}`}
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
			</div>
			{children}
		</li>
	);
}
