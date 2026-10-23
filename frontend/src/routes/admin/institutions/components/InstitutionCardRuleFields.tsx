import type { InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { NumericField } from "@/components/ui/NumericField";

export function InstitutionCardRuleFields({
	value,
	onChange,
}: {
	value: InstitutionCardRules;
	onChange: (value: InstitutionCardRules) => void;
}) {
	const reward = value.cashback;
	const setReward = (patch: Partial<NonNullable<InstitutionCardRules["cashback"]>>) => {
		if (reward) onChange({ ...value, cashback: { ...reward, ...patch } });
	};
	return (
		<div className="space-y-4">
			<CustomSelect
				label="Troca do vencimento"
				onValueChange={mode => onChange({ ...value, transitionMode: mode as "EXTRA_CYCLE" | "NEXT_CYCLE" })}
				options={[
					{ label: "Aplicar no próximo ciclo mensal", value: "NEXT_CYCLE" },
					{ label: "Permitir ciclo extra no mesmo mês", value: "EXTRA_CYCLE" },
				]}
				placeholder="Ex: Próximo ciclo mensal"
				value={value.transitionMode ?? "NEXT_CYCLE"}
			/>
			<CustomSelect
				label="Parcelas após troca do vencimento"
				onValueChange={mode => onChange({ ...value, installmentMode: mode as "PER_CYCLE" | "PER_MONTH" })}
				options={[
					{ label: "Uma parcela por mês", value: "PER_MONTH" },
					{ label: "Uma parcela por ciclo", value: "PER_CYCLE" },
				]}
				placeholder="Ex: Uma parcela por mês"
				value={value.installmentMode ?? "PER_MONTH"}
			/>
			<CheckboxField
				checkboxProps={{
					checked: value.workingDueDate,
					onCheckedChange: checked => onChange({ ...value, workingDueDate: checked === true }),
				}}
			>
				Ajustar vencimento para dia útil
			</CheckboxField>
			<CheckboxField
				checkboxProps={{
					checked: reward !== null,
					onCheckedChange: checked =>
						onChange({
							...value,
							cashback:
								checked === true
									? {
											conversionAmount: null,
											conversionPoints: null,
											kind: "CASHBACK",
											rate: 1,
											yieldPeriod: null,
											yieldReferencePercentage: null,
											yieldReferenceRate: null,
										}
									: null,
						}),
				}}
			>
				Cartões oferecem cashback ou pontos
			</CheckboxField>
			{reward && (
				<>
					<CustomSelect
						label="Tipo de recompensa"
						onValueChange={kind =>
							setReward({
								conversionAmount: null,
								conversionPoints: null,
								kind: kind as "CASHBACK" | "POINTS",
							})
						}
						options={[
							{ label: "Cashback em dinheiro", value: "CASHBACK" },
							{ label: "Pontos", value: "POINTS" },
						]}
						placeholder="Ex: Cashback em dinheiro"
						value={reward.kind}
					/>
					<NumericField
						id="institution-reward-rate"
						label={
							reward.kind === "POINTS" ? "Pontos a cada 100 unidades da moeda do cartão gastas" : "Cashback"
						}
						onValueChange={rate => setReward({ rate: Number(rate) })}
						placeholder={reward.kind === "CASHBACK" ? "Ex: 1,5%" : "Ex: 100"}
						required
						suffix={reward.kind === "CASHBACK" ? "%" : undefined}
						value={String(reward.rate || "")}
					/>
					{reward.kind === "POINTS" && (
						<>
							<CheckboxField
								checkboxProps={{
									checked: reward.conversionPoints !== null,
									onCheckedChange: checked =>
										setReward({
											conversionAmount: checked === true ? 10 : null,
											conversionPoints: checked === true ? 1000 : null,
										}),
								}}
							>
								Converter pontos para exibição monetária
							</CheckboxField>
							{reward.conversionPoints !== null && (
								<FormFieldRow className="sm:grid-cols-2">
									<NumericField
										id="institution-conversion-points"
										label="Pontos da conversão"
										onValueChange={points => setReward({ conversionPoints: Number(points) })}
										placeholder="Ex: 1.000"
										required
										value={String(reward.conversionPoints || "")}
									/>
									<NumericField
										id="institution-conversion-amount"
										label="Valor na moeda da conta"
										onValueChange={amount => setReward({ conversionAmount: Number(amount) })}
										placeholder="Ex: 10,00"
										required
										value={String(reward.conversionAmount || "")}
									/>
								</FormFieldRow>
							)}
						</>
					)}
					<CheckboxField
						checkboxProps={{
							checked: reward.yieldPeriod !== null,
							onCheckedChange: checked =>
								setReward({
									yieldPeriod: checked === true ? "YEARLY" : null,
									yieldReferencePercentage: checked === true ? 100 : null,
									yieldReferenceRate: checked === true ? 10 : null,
								}),
						}}
					>
						Recompensa rende ao longo do tempo
					</CheckboxField>
					{reward.yieldPeriod !== null && (
						<div className="space-y-4">
							<FormFieldRow className="sm:grid-cols-2">
								<NumericField
									id="institution-reward-yield-rate"
									label="Taxa de referência"
									onValueChange={rate => setReward({ yieldReferenceRate: Number(rate) })}
									placeholder="Ex: 10%"
									required
									suffix="%"
									value={String(reward.yieldReferenceRate || "")}
								/>
								<NumericField
									id="institution-reward-yield-percentage"
									label="Percentual da referência"
									onValueChange={percentage => setReward({ yieldReferencePercentage: Number(percentage) })}
									placeholder="Ex: 100%"
									required
									suffix="%"
									value={String(reward.yieldReferencePercentage || "")}
								/>
							</FormFieldRow>
							<CustomSelect
								label="Período do rendimento"
								onValueChange={period => setReward({ yieldPeriod: period as "MONTHLY" | "YEARLY" })}
								options={[
									{ label: "Mensal", value: "MONTHLY" },
									{ label: "Anual", value: "YEARLY" },
								]}
								placeholder="Ex: Anual"
								value={reward.yieldPeriod}
							/>
						</div>
					)}
				</>
			)}
		</div>
	);
}
