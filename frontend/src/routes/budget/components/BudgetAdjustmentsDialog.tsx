import { isMonthlyAdjustment, sameBudgetPlan } from "@zaimu/finance/monthly-budget";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { MonthlyBudget, MonthlyBudgetInput } from "@/lib/monthly-budget-service";
import { BudgetAdjustmentForm } from "./BudgetAdjustmentForm";
import { BudgetAdjustmentRow } from "./BudgetAdjustmentRow";
import { BudgetOverview } from "./BudgetOverview";

export function BudgetAdjustmentsDialog({
	budgets,
	month,
	pendingIds,
	saving,
	onMonthChange,
	onSave,
	onRemove,
	onClose,
}: {
	budgets: MonthlyBudget[];
	month: string;
	pendingIds: Set<string>;
	saving: boolean;
	onMonthChange: (month: string) => void;
	onSave: (input: MonthlyBudgetInput, id?: string) => Promise<unknown>;
	onRemove: (id: string) => void;
	onClose: () => void;
}) {
	const [editing, setEditing] = useState<{ item: MonthlyBudget; adjustment?: MonthlyBudget } | null>(null);
	const defaults = budgets.filter(
		item =>
			!isMonthlyAdjustment(item) && item.startMonth <= month && (!item.endMonth || item.endMonth >= month),
	);
	const adjustments = budgets.filter(item => isMonthlyAdjustment(item) && item.startMonth === month);
	const rows = [
		...defaults,
		...adjustments.filter(item => !defaults.some(base => sameBudgetPlan(base, item))),
	];
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !saving) onClose();
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{editing ? "Ajustar valor do mês" : "Ajustes por mês"}</DialogTitle>
				</DialogHeader>
				{editing ? (
					<BudgetAdjustmentForm
						adjustment={editing.adjustment}
						item={editing.item}
						month={month}
						onDiscard={() => setEditing(null)}
						onSave={onSave}
						pending={saving}
					/>
				) : (
					<>
						<DialogBody>
							<div className="space-y-4">
								<p className="text-muted-foreground text-sm">
									Altere somente o mês escolhido. O plano geral continua valendo nos demais meses.
								</p>
								<BudgetOverview month={month} onMonthChange={onMonthChange} />
								{rows.length ? (
									<ul className="divide-y">
										{rows.map(item => {
											const adjustment = adjustments.find(row => sameBudgetPlan(row, item));
											return (
												<BudgetAdjustmentRow
													adjustment={adjustment}
													item={item}
													key={item.id}
													onEdit={() => setEditing({ adjustment, item })}
													onRestore={() => {
														if (adjustment) onRemove(adjustment.id);
													}}
													pending={
														pendingIds.has(item.id) || Boolean(adjustment && pendingIds.has(adjustment.id))
													}
												/>
											);
										})}
									</ul>
								) : (
									<p className="py-4 text-muted-foreground text-sm">Nenhum planejamento vigente neste mês.</p>
								)}
							</div>
						</DialogBody>
						<DialogFooter>
							<Button onClick={onClose} variant="outline">
								Fechar
							</Button>
						</DialogFooter>
					</>
				)}
			</DialogContent>
		</Dialog>
	);
}
