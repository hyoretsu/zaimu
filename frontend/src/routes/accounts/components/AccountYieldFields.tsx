import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { NumericField } from "@/components/ui/NumericField";
import { YieldTaxFields } from "./YieldTaxFields";

export function AccountYieldFields({
	enabled,
	allowReference,
	fixedRate,
	period,
	referencePercentage,
	referenceType,
	taxRate,
	taxIds,
	taxModes,
	onEnabledChange,
	onFixedRateChange,
	onPeriodChange,
	onReferencePercentageChange,
	onReferenceTypeChange,
	onTaxRateChange,
	onTaxIdsChange,
	onTaxModesChange,
}: {
	enabled: boolean;
	allowReference: boolean;
	fixedRate: string;
	period: "MONTHLY" | "YEARLY";
	referencePercentage: string;
	referenceType: string;
	taxRate: string;
	taxIds: string[];
	taxModes: Record<string, "DAILY" | "ON_REDEMPTION">;
	onEnabledChange: (enabled: boolean) => void;
	onFixedRateChange: (rate: string) => void;
	onPeriodChange: (period: "MONTHLY" | "YEARLY") => void;
	onReferencePercentageChange: (percentage: string) => void;
	onReferenceTypeChange: (rate: "" | "CDI" | "SELIC" | "IPCA" | "TR") => void;
	onTaxRateChange: (rate: string) => void;
	onTaxIdsChange: (type: string[]) => void;
	onTaxModesChange: (modes: Record<string, "DAILY" | "ON_REDEMPTION">) => void;
}) {
	const hasReference = Boolean(referenceType);
	return (
		<div className="bg-muted/35 grid gap-4 rounded-2xl border p-4">
			<CheckboxField
				align="start"
				checkboxProps={{
					checked: enabled,
					id: "account-yield-enabled",
					onCheckedChange: checked => onEnabledChange(checked === true),
				}}
			>
				<span>
					<strong className="block">Customizar rendimento</strong>
					<span className="text-muted-foreground">
						O rendimento é automático com base nas regras da instituição, mas pode ser
						customizado. Calculado diariamente de segunda a sexta. Feriados pausam todas as
						contas.
					</span>
				</span>
			</CheckboxField>
			{enabled && (
				<div className="grid gap-4">
					<p className="text-muted-foreground text-xs">
						Preencha a taxa de referência, a taxa fixa ou ambas.
					</p>
					<div className="@container grid gap-4 @md:grid-cols-2">
						{allowReference && (
							<CustomSelect
								label="Taxa de referência"
								onValueChange={value =>
									onReferenceTypeChange(value as "CDI" | "SELIC" | "IPCA" | "TR")
								}
								options={[
									{ label: "CDI", value: "CDI" },
									{ label: "Taxa Selic", value: "SELIC" },
									{ label: "IPCA", value: "IPCA" },
									{ label: "TR", value: "TR" },
								]}
								placeholder="Selecione indicador"
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
						<YieldTaxFields
							id="account-yield-tax-rate"
							onTaxIdsChange={onTaxIdsChange}
							onTaxModesChange={onTaxModesChange}
							onTaxRateChange={onTaxRateChange}
							taxIds={taxIds}
							taxModes={taxModes}
							taxRate={taxRate}
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
