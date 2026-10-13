import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { DialogBody, DialogFooter } from "@/components/ui/Dialog";
import type { MonthlyBudget, MonthlyBudgetInput } from "@/lib/monthly-budget-service";
import { BudgetAmountField } from "./BudgetAmountField";
import { budgetMoney } from "./budget-display";

export function BudgetAdjustmentForm({
	item,
	adjustment,
	month,
	pending,
	onSave,
	onDiscard,
}: {
	item: MonthlyBudget;
	adjustment?: MonthlyBudget;
	month: string;
	pending: boolean;
	onSave: (input: MonthlyBudgetInput, id?: string) => Promise<unknown>;
	onDiscard: () => void;
}) {
	const [amount, setAmount] = useState(adjustment?.amount ?? item.amount);
	return (
		<form
			className="flex min-h-0 flex-1 flex-col gap-6"
			onSubmit={async event => {
				event.preventDefault();
				const raw = Number(new FormData(event.currentTarget).get("budget-amount-raw"));
				if (!Number.isFinite(raw) || raw <= 0) return;
				try {
					await onSave(
						{
							amount: raw,
							categoryId: item.categoryId,
							currency: item.currency,
							endMonth: month,
							name: item.name,
							parentBudgetId: item.parentBudgetId ?? null,
							source: item.source,
							startMonth: month,
						},
						adjustment?.id,
					);
					onDiscard();
				} catch {
					/* Mutation presents the error; preserve draft. */
				}
			}}
		>
			<DialogBody>
				<div className="space-y-4">
					<div>
						<h3 className="font-semibold">{item.name}</h3>
						<p className="text-muted-foreground text-sm">
							Padrão: {budgetMoney(item.amount, item.currency)}. Ajuste vale somente para {month}.
						</p>
					</div>
					<BudgetAmountField
						currency={item.currency}
						disabled={pending}
						onChange={setAmount}
						value={amount}
					/>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button disabled={pending} onClick={onDiscard} type="button" variant="outline">
					Descartar
				</Button>
				<Button disabled={pending} type="submit">
					{pending ? "Salvando..." : "Salvar"}
				</Button>
			</DialogFooter>
		</form>
	);
}
