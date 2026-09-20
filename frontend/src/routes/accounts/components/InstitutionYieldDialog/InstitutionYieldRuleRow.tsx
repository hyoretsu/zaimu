import { LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { NumericField } from "@/components/ui/NumericField";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { EditableYieldRule } from "./types";

export function InstitutionYieldRuleRow({
	index,
	isLast,
	onChange,
	onRemove,
	rule,
}: {
	index: number;
	isLast: boolean;
	onChange: (rule: EditableYieldRule) => void;
	onRemove: () => void;
	rule: EditableYieldRule;
}) {
	const [upToBalance, setUpToBalance] = useDebouncedInput(rule.upToBalance, value =>
		onChange({ ...rule, upToBalance: value }),
	);
	const [fixedRate, setFixedRate] = useDebouncedInput(rule.fixedRate, value =>
		onChange({ ...rule, fixedRate: value }),
	);
	const [referencePercentage, setReferencePercentage] = useDebouncedInput(rule.referencePercentage, value =>
		onChange({ ...rule, referencePercentage: value }),
	);
	return (
		<div className="grid gap-4 rounded-2xl border bg-muted/25 p-4">
			<div className="flex items-center justify-between gap-3">
				<p className="font-semibold text-sm">Faixa {index + 1}</p>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Excluir faixa ${index + 1}`}
							className="cursor-pointer"
							onClick={onRemove}
							size="icon"
							type="button"
							variant="outline"
						>
							<LuTrash2 />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Excluir faixa</TooltipContent>
				</Tooltip>
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{isLast ? (
					<div className="grid gap-2">
						<p className="font-medium text-sm">Limite da faixa</p>
						<div className="flex h-10 items-center rounded-md border bg-muted px-3 text-muted-foreground text-sm">
							Saldo excedente, sem limite
						</div>
					</div>
				) : (
					<NumericField
						decimalScale={2}
						id={`institution-yield-limit-${rule.id}`}
						label="Saldo até"
						onValueChange={setUpToBalance}
						placeholder="R$ 10.000,00"
						required
						value={upToBalance}
					/>
				)}
				<NumericField
					id={`institution-yield-fixed-${rule.id}`}
					label="Taxa fixa"
					onValueChange={setFixedRate}
					placeholder="Ex: 1,00%"
					suffix="%"
					value={fixedRate}
				/>
				<CustomSelect
					label="Taxa de referência"
					onValueChange={value => onChange({ ...rule, referenceType: value as "CDI" | "SELIC" })}
					options={[
						{ label: "CDI", value: "CDI" },
						{ label: "Taxa Selic", value: "SELIC" },
					]}
					placeholder="Selecione CDI ou Selic"
					value={rule.referenceType}
				/>
				<NumericField
					id={`institution-yield-percentage-${rule.id}`}
					label="Percentual da referência"
					onValueChange={setReferencePercentage}
					placeholder="Ex: 100,00%"
					required={Boolean(rule.referenceType)}
					suffix="%"
					value={referencePercentage}
				/>
			</div>
		</div>
	);
}
