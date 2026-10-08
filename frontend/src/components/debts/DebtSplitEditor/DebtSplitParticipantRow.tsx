import { LuTrash2 } from "react-icons/lu";
import { DebtPersonPicker } from "@/components/debts/DebtPersonPicker";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { DebtSplitInput } from "@/lib/api";

export function DebtSplitParticipantRow({
	amount,
	currencyCode,
	totalAmount,
	disabled,
	excludedPersonIds,
	index,
	onPersonChange,
	onDescriptionChange,
	onRemove,
	onRemainderRecipientChange,
	onValueChange,
	participant,
	isRemainderRecipient,
	showDescription,
	mode,
}: {
	amount?: number;
	currencyCode: string;
	totalAmount: number;
	disabled?: boolean;
	excludedPersonIds?: string[];
	index: number;
	mode: DebtSplitInput["mode"];
	onPersonChange: (id: string) => void;
	onDescriptionChange: (description: string) => void;
	onRemove: () => void;
	onRemainderRecipientChange?: (selected: boolean) => void;
	onValueChange: (value: number) => void;
	participant: DebtSplitInput["participants"][number];
	isRemainderRecipient?: boolean;
	showDescription: boolean;
}) {
	const [description, setDescription] = useDebouncedInput(participant.description ?? "", onDescriptionChange);
	const numericValue = isRemainderRecipient
		? amount === undefined
			? ""
			: mode === "PERCENTAGE"
				? String(totalAmount > 0 ? Number(((amount / totalAmount) * 100).toFixed(2)) : 0)
				: String(amount)
		: mode === "SHARES"
			? String((participant as { shares: number }).shares || "")
			: mode === "PERCENTAGE"
				? String((participant as { percentage: number }).percentage || "")
				: String((participant as { fixedAmount: number }).fixedAmount || "");
	return (
		<div className="grid min-w-0 max-w-full gap-3 rounded-xl border p-3 [&>*]:min-w-0">
			<div className="flex min-w-0 flex-wrap items-end gap-2">
				<div className="min-w-0 flex-[2_1_8rem]">
					<DebtPersonPicker
						disabled={disabled}
						excludedIds={excludedPersonIds}
						onValueChange={onPersonChange}
						required
						value={participant.debtPersonId}
					/>
				</div>
				<div className={mode === "SHARES" ? "min-w-0 flex-[1_1_4rem]" : "min-w-0 flex-[1_1_7rem]"}>
					{mode === "FIXED" ? (
						<MoneyField
							currencyCode={currencyCode}
							disabled={disabled || isRemainderRecipient}
							id={`debt-split-${index}`}
							label="Valor"
							onValueChange={value => onValueChange(Number(value))}
							required={!isRemainderRecipient}
							value={numericValue}
						/>
					) : (
						<NumericField
							decimalScale={mode === "PERCENTAGE" ? 2 : 0}
							disabled={disabled || isRemainderRecipient}
							id={`debt-split-${index}`}
							label={mode === "SHARES" ? "Cotas" : "Porcentagem"}
							onValueChange={value => onValueChange(Number(value))}
							placeholder={mode === "SHARES" ? "Ex: 1" : "Ex: 25%"}
							required={!isRemainderRecipient}
							suffix={mode === "PERCENTAGE" ? "%" : undefined}
							value={numericValue}
						/>
					)}
				</div>
			</div>
			{showDescription ? (
				<FormField
					disabled={disabled}
					id={`debt-split-description-${index}`}
					label="Descrição da dívida"
					name={`debt-split-description-${index}`}
					onChange={event => setDescription(event.currentTarget.value)}
					placeholder="Ex: Capa de celular"
					type="text"
					value={description}
				/>
			) : null}
			{mode !== "SHARES" ? (
				<CheckboxField
					checkboxProps={{
						checked: isRemainderRecipient,
						disabled,
						onCheckedChange: checked => onRemainderRecipientChange?.(checked === true),
					}}
				>
					Fica com o restante
				</CheckboxField>
			) : null}
			<div className="flex min-w-0 items-center justify-between gap-2">
				{amount !== undefined ? (
					<p className="min-w-0 text-muted-foreground text-xs">
						Parcela:{" "}
						{new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(amount)}
					</p>
				) : null}
				<ActionGroup className="ml-auto shrink-0">
					<Button
						aria-label="Remover pessoa"
						className="cursor-pointer"
						disabled={disabled}
						onClick={onRemove}
						size="icon"
						type="button"
						variant="outline"
					>
						<LuTrash2 />
					</Button>
				</ActionGroup>
			</div>
		</div>
	);
}
