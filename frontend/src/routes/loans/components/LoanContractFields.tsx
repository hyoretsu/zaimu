import { shiftMonths } from "@zaimu/finance/financial-indicators";
import type { LoanContractTerms } from "@zaimu/finance/loan-contract";
import { LuPlus } from "react-icons/lu";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { showToast } from "@/stores";
import { LoanChargeRow } from "./LoanChargeRow";
import { LoanManualRow } from "./LoanManualRow";
import { LoanRateFields } from "./LoanRateFields";
import { LoanSection } from "./LoanSection";
export function LoanContractFields({
	value,
	onChange,
}: {
	value: LoanContractTerms;
	onChange: (value: LoanContractTerms) => void;
}) {
	const set = <K extends keyof LoanContractTerms>(key: K, v: LoanContractTerms[K]) =>
		onChange({ ...value, [key]: v });
	return (
		<>
			<FormFieldRow>
				<MoneyField
					currencyCode={value.currency}
					id="loan-principal"
					label="Principal"
					onValueChange={v => set("principalAmount", Number(v))}
					required
					value={String(value.principalAmount || "")}
				/>
				<CurrencySelect onValueChange={v => set("currency", v)} value={value.currency} />
				<NumericField
					decimalScale={0}
					id="loan-installments"
					label="Número de parcelas"
					onValueChange={v => set("totalInstallments", Number(v))}
					placeholder="Ex: 80"
					required
					value={String(value.totalInstallments)}
				/>
				<CustomSelect
					label="Amortização"
					onValueChange={v => set("amortization", v as LoanContractTerms["amortization"])}
					options={[
						{ label: "PRICE - prestação fixa", value: "PRICE" },
						{ label: "SAC - amortização constante", value: "SAC" },
						{ label: "Cronograma manual", value: "MANUAL" },
					]}
					placeholder="Ex: PRICE"
					required
					value={value.amortization}
				/>
			</FormFieldRow>
			<FormFieldRow>
				<DateField
					id="contract-start"
					label="Início"
					name="contract-start"
					onValueChange={v => set("startDate", v)}
					required
					value={value.startDate}
				/>
				<DateField
					id="contract-first-due"
					label="Primeiro vencimento"
					name="contract-first-due"
					onValueChange={v => set("firstDueDate", v)}
					required
					value={value.firstDueDate}
				/>
			</FormFieldRow>
			<LoanSection
				initiallyOpen
				summary={
					value.rate.indicator ??
					`${value.rate.fixedRate ?? 0}% ${value.rate.fixedPeriod === "YEARLY" ? "ao ano" : "ao mês"}`
				}
				title="Juros e correção"
			>
				<LoanRateFields onChange={v => set("rate", v)} value={value.rate} />
			</LoanSection>
			<LoanSection summary={`${value.graceMonths} meses de carência`} title="Carência e atraso">
				<FormFieldRow>
					<NumericField
						decimalScale={0}
						id="loan-grace"
						label="Meses de carência"
						onValueChange={v => set("graceMonths", Number(v))}
						placeholder="Ex: 3"
						value={String(value.graceMonths)}
					/>
					<CustomSelect
						label="Juros na carência"
						onValueChange={v => set("graceInterest", v as LoanContractTerms["graceInterest"])}
						options={[
							{ label: "Pagar juros", value: "PAY" },
							{ label: "Capitalizar juros", value: "CAPITALIZE" },
						]}
						placeholder="Ex: Pagar juros"
						value={value.graceInterest}
					/>
					<NumericField
						id="loan-late-fine"
						label="Multa por atraso"
						onValueChange={v => set("lateFinePercent", Number(v))}
						placeholder="Ex: 2%"
						suffix="%"
						value={String(value.lateFinePercent)}
					/>
					<NumericField
						id="loan-late-rate"
						label="Juros mensais por atraso"
						onValueChange={v => set("lateMonthlyPercent", Number(v))}
						placeholder="Ex: 1%"
						suffix="%"
						value={String(value.lateMonthlyPercent)}
					/>
				</FormFieldRow>
			</LoanSection>
			<LoanSection summary={`${value.charges.length} encargos`} title="Seguros, tarifas e impostos">
				{value.charges.map((charge, index) => (
					<LoanChargeRow
						currency={value.currency}
						index={index}
						key={index}
						onChange={row =>
							set(
								"charges",
								value.charges.map((old, i) => (i === index ? row : old)),
							)
						}
						onRemove={() => {
							set(
								"charges",
								value.charges.filter((_, i) => i !== index),
							);
							showToast("Encargo removido do formulário", "info");
						}}
						value={charge}
					/>
				))}
				<Button
					onClick={() => {
						set("charges", [
							...value.charges,
							{ amount: 0, financed: false, name: "", recurring: false },
						]);
						showToast("Campo de encargo adicionado", "info");
					}}
					type="button"
					variant="outline"
				>
					<LuPlus />
					Adicionar encargo
				</Button>
			</LoanSection>
			<CustomSelect
				label="Desconto por antecipação"
				onValueChange={v => set("discount", v as LoanContractTerms["discount"])}
				options={[
					{ label: "Valor presente pela taxa contratual", value: "PRESENT_VALUE" },
					{ label: "Sem desconto automático", value: "NO_DISCOUNT" },
				]}
				placeholder="Ex: Valor presente"
				value={value.discount}
			/>
			{value.amortization === "MANUAL" && (
				<LoanSection
					initiallyOpen
					summary={`${value.manualSchedule?.length ?? 0} parcelas`}
					title="Cronograma manual"
				>
					{value.manualSchedule?.map((row, index) => (
						<LoanManualRow
							currency={value.currency}
							index={index}
							key={index}
							onChange={row =>
								set(
									"manualSchedule",
									value.manualSchedule!.map((old, i) => (i === index ? row : old)),
								)
							}
							onRemove={() => {
								const rows = value.manualSchedule!.filter((_, i) => i !== index);
								onChange({ ...value, manualSchedule: rows, totalInstallments: rows.length });
								showToast("Parcela removida do formulário", "info");
							}}
							value={row}
						/>
					))}
					<Button
						onClick={() => {
							const rows = [
								...(value.manualSchedule ?? []),
								{
									charges: 0,
									dueDate: shiftMonths(
										value.firstDueDate,
										value.manualSchedule?.length ?? 0,
									),
									interest: 0,
									principal: 0,
								},
							];
							onChange({ ...value, manualSchedule: rows, totalInstallments: rows.length });
							showToast("Campo de parcela adicionado", "info");
						}}
						type="button"
						variant="outline"
					>
						<LuPlus />
						Adicionar parcela
					</Button>
				</LoanSection>
			)}
		</>
	);
}
