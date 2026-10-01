import { DebtSplitEditor } from "@/components/debts";
import { StorePicker } from "@/components/stores";
import { TagPicker } from "@/components/tags";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { Label } from "@/components/ui/Label";
import type { DebtSplitInput } from "@/lib/api";
import type { UnifiedRecurringDraft } from "./unified-types";
export function RecurrenceOptionalFields({
	draft,
	set,
	debtEnabled,
	setDebtEnabled,
	debtSplit,
	setDebtSplit,
	disabled,
}: {
	draft: UnifiedRecurringDraft;
	set: <K extends keyof UnifiedRecurringDraft>(key: K, value: UnifiedRecurringDraft[K]) => void;
	debtEnabled: boolean;
	setDebtEnabled: (value: boolean) => void;
	debtSplit: DebtSplitInput;
	setDebtSplit: (value: DebtSplitInput) => void;
	disabled: boolean;
}) {
	const debtAllowed = !["TRANSFER", "CARD_PAYMENT"].includes(draft.movement);
	return (
		<div className="space-y-4">
			<div className="grid gap-4 sm:grid-cols-2">
				<div className="grid gap-2">
					<Label>Estabelecimento (opcional)</Label>
					<StorePicker
						disabled={disabled}
						onValueChange={value => set("storeName", value)}
						value={draft.storeName}
					/>
				</div>
				<div className="grid gap-2">
					<Label>Tags (opcional)</Label>
					<TagPicker disabled={disabled} onValueChange={value => set("tagIds", value)} value={draft.tagIds} />
				</div>
			</div>
			{debtAllowed && (
				<div className="space-y-3">
					<CheckboxField
						checkboxProps={{
							checked: debtEnabled,
							disabled,
							onCheckedChange: checked => setDebtEnabled(checked === true),
						}}
					>
						Vincular pessoa ou repartir valor
					</CheckboxField>
					{debtEnabled && (
						<>
							<DebtSplitEditor
								amount={Number(draft.amount) || 0}
								disabled={disabled}
								onChange={setDebtSplit}
								value={debtSplit}
							/>
							<p className="text-muted-foreground text-xs">
								Para quitação, escolha pessoa e atribua valor integral. Recorrência mantém valor após saldo
								zerar e pode inverter saldo da dívida.
							</p>
						</>
					)}
				</div>
			)}
		</div>
	);
}
