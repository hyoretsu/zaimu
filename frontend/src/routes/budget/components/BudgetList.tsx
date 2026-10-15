import type { MonthlyBudget } from "@/lib/monthly-budget-service";
import { BudgetItem } from "./BudgetItem";
import { budgetSourceLabel } from "./budget-display";

export function BudgetList({
	budgets,
	parent,
	pendingIds,
	onEdit,
	onDelete,
}: {
	budgets: MonthlyBudget[];
	parent?: MonthlyBudget;
	pendingIds: Set<string>;
	onEdit: (item: MonthlyBudget) => void;
	onDelete: (id: string) => void;
}) {
	const items = budgets.filter(item =>
		parent
			? item.parentBudgetId === parent.id
			: !item.parentBudgetId || !budgets.some(candidate => candidate.id === item.parentBudgetId),
	);
	if (!items.length) return null;
	return (
		<ul
			aria-label={parent ? `Incluídos em ${parent.name || budgetSourceLabel(parent)}` : "Plano geral"}
			className={
				parent
					? "mr-2 mb-3 ml-3 min-w-0 divide-y rounded-r-lg border-primary/25 border-l-2 bg-muted/40 sm:mr-3 sm:ml-6"
					: "min-w-0 space-y-3 [&>li]:rounded-xl [&>li]:border"
			}
		>
			{items.map(item => (
				<BudgetItem
					item={item}
					key={item.id}
					onDelete={() => onDelete(item.id)}
					onEdit={() => onEdit(item)}
					pending={pendingIds.has(item.id)}
				>
					<BudgetList
						budgets={budgets}
						onDelete={onDelete}
						onEdit={onEdit}
						parent={item}
						pendingIds={pendingIds}
					/>
				</BudgetItem>
			))}
		</ul>
	);
}
