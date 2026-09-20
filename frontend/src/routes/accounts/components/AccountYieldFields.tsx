import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { NumericField } from "@/components/ui/NumericField";

export function AccountYieldFields({
	enabled,
	allowReference,
	fixedRate,
	period,
	referencePercentage,
	referenceType,
	taxRate,
	onEnabledChange,
	onFixedRateChange,
	onPeriodChange,
	onReferencePercentageChange,
	onReferenceTypeChange,
	onTaxRateChange,
}: {
	enabled: boolean;
	allowReference: boolean;
	fixedRate: string;
	period: "MONTHLY" | "YEARLY";
	referencePercentage: string;
	referenceType: string;
	taxRate: string;
	onEnabledChange: (enabled: boolean) => void;
	onFixedRateChange: (rate: string) => void;
	onPeriodChange: (period: "MONTHLY" | "YEARLY") => void;
	onReferencePercentageChange: (percentage: string) => void;
	onReferenceTypeChange: (rate: "" | "CDI" | "SELIC") => void;
	onTaxRateChange: (rate: string) => void;
}) {
	const hasReference = Boolean(referenceType);
	return (
		<div className="grid gap-4 rounded-2xl border bg-muted/35 p-4">
			<CheckboxField
				align="start"
				checkboxProps={{
					checked: enabled,
					id: "account-yield-enabled",
					onCheckedChange: checked => onEnabledChange(checked === true),
				}}
			>
				<span>
					<strong className="block">Esta conta rende</strong>
					<span className="text-muted-foreground">
						Calculado diariamente de segunda a sexta. Feriados pausam todas as contas.
					</span>
				</span>
			</CheckboxField>
			{enabled && (
				<div className="grid gap-4">
					<p className="text-muted-foreground text-xs">
						Preencha a taxa de referência, a taxa fixa ou ambas.
					</p>
					<div className="grid gap-4 sm:grid-cols-2">
						{allowReference && (
							<CustomSelect
								label="Taxa de referência"
								onValueChange={value => onReferenceTypeChange(value as "CDI" | "SELIC")}
								options={[
									{ label: "CDI", value: "CDI" },
									{ label: "Taxa Selic", value: "SELIC" },
								]}
								placeholder="Selecione CDI ou Selic"
								value={referenceType}
							/>
						)}
						{allowReference && (
							<NumericField
								decimalScale={4}
								id="account-yield-reference-percentage"
								label="Percentual da referência"
								onValueChange={onReferencePercentageChange}
								placeholder="Ex: 105%"
								required={hasReference}
								suffix="%"
								value={referencePercentage}
							/>
						)}
						<NumericField
							decimalScale={4}
							id="account-yield-fixed-rate"
							label="Taxa fixa"
							onValueChange={onFixedRateChange}
							placeholder="Ex: 0,5%"
							suffix="%"
							value={fixedRate}
						/>
						<NumericField
							decimalScale={2}
							description="Descontada de cada rendimento automático."
							id="account-yield-tax-rate"
							label="Alíquota de imposto total"
							onValueChange={onTaxRateChange}
							placeholder="Ex: 15%"
							suffix="%"
							value={taxRate}
						/>
						{Boolean(fixedRate) && (
							<CustomSelect
								label="Período"
								onValueChange={value => onPeriodChange(value as "MONTHLY" | "YEARLY")}
								options={[
									{ label: "Ao mês (21 dias úteis)", value: "MONTHLY" },
									{ label: "Ao ano (252 dias úteis)", value: "YEARLY" },
								]}
								placeholder="Selecione o período"
								required={Boolean(fixedRate)}
								value={period}
							/>
						)}
					</div>
				</div>
			)}
		</div>
	);
}
