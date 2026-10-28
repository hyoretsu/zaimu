import type { FinancialRateRule } from "@zaimu/finance/financial-indicators";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { NumericField } from "@/components/ui/NumericField";
export function LoanRateFields({
	value,
	onChange,
}: {
	value: FinancialRateRule;
	onChange: (value: FinancialRateRule) => void;
}) {
	return (
		<>
			<FormFieldRow>
				<CustomSelect
					label="Indicador financeiro"
					onValueChange={indicator =>
						onChange({
							...value,
							indicator:
								indicator === "FIXED" ? null : (indicator as FinancialRateRule["indicator"]),
							percentage: indicator === "FIXED" ? null : (value.percentage ?? 100),
						})
					}
					options={[
						{ label: "Taxa fixa", value: "FIXED" },
						...(["CDI", "SELIC", "IPCA", "TR"] as const).map(key => ({ label: key, value: key })),
					]}
					placeholder="Ex: IPCA"
					value={value.indicator ?? "FIXED"}
				/>
				{value.indicator && (
					<NumericField
						id="loan-reference-percent"
						label="Percentual do indicador"
						onValueChange={v => onChange({ ...value, percentage: Number(v) })}
						placeholder="Ex: 100%"
						required
						suffix="%"
						value={String(value.percentage ?? 100)}
					/>
				)}
				<NumericField
					id="loan-fixed-rate"
					label="Taxa fixa"
					onValueChange={v => onChange({ ...value, fixedRate: Number(v) })}
					placeholder="Ex: 1,5%"
					required
					suffix="%"
					value={String(value.fixedRate ?? 0)}
				/>
				<CustomSelect
					label="Período da taxa fixa"
					onValueChange={v => onChange({ ...value, fixedPeriod: v as "MONTHLY" | "YEARLY" })}
					options={[
						{ label: "Mensal", value: "MONTHLY" },
						{ label: "Anual", value: "YEARLY" },
					]}
					placeholder="Ex: Mensal"
					value={value.fixedPeriod ?? "MONTHLY"}
				/>
			</FormFieldRow>
			{value.indicator && (
				<>
					<NumericField
						decimalScale={0}
						id="loan-index-lag"
						label="Defasagem do indicador em meses"
						onValueChange={v => onChange({ ...value, lagMonths: Number(v) })}
						placeholder="Ex: 1"
						value={String(value.lagMonths ?? 0)}
					/>
					<CheckboxField
						checkboxProps={{
							checked: value.negativeFloor ?? false,
							onCheckedChange: checked =>
								onChange({ ...value, negativeFloor: checked === true }),
						}}
					>
						Limitar correção negativa a zero conforme contrato
					</CheckboxField>
				</>
			)}
			<p className="text-muted-foreground text-xs">
				Percentual do indicador e taxa fixa são compostos. Projeções usam histórico dos últimos cinco
				anos; valores futuros são estimados.
			</p>
		</>
	);
}
