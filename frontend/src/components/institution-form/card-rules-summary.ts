import type { InstitutionCardRules } from "@zaimu/finance/institution-card-rules";

export interface RuleLine {
	label: string;
	value: string;
}

const percent = (value: number) => `${String(value).replace(".", ",")}%`;

/** Readable label/value lines of card rules, used by the form summary and the review diff. */
export function describeCardRules(rules: InstitutionCardRules | null | undefined): RuleLine[] {
	const reward = rules?.cashback;
	const lines: RuleLine[] = [
		{
			label: "Troca do vencimento",
			value:
				rules?.transitionMode === "EXTRA_CYCLE"
					? "Permite ciclo extra no mesmo mês"
					: "Aplica no próximo ciclo mensal",
		},
		{
			label: "Parcelas após troca do vencimento",
			value: rules?.installmentMode === "PER_CYCLE" ? "Uma parcela por ciclo" : "Uma parcela por mês",
		},
		{
			label: "Vencimento em dia útil",
			value: rules?.workingDueDate ? "Sim" : "Não",
		},
	];
	if (!reward) {
		lines.push({ label: "Recompensa", value: "Nenhuma" });
		return lines;
	}
	if (reward.kind === "POINTS") {
		lines.push({
			label: "Recompensa",
			value: `Pontos - ${String(reward.rate)} a cada 100 gastos${
				reward.conversionPoints !== null
					? `, ${reward.conversionPoints} pontos valem ${reward.conversionAmount}`
					: ""
			}`,
		});
	} else {
		lines.push({
			label: "Recompensa",
			value: `Cashback ${percent(reward.rate)}${reward.assetCode ? ` em ${reward.assetCode}` : ""}`,
		});
	}
	if (reward.yieldPeriod !== null)
		lines.push({
			label: "Rendimento da recompensa",
			value: `${percent(reward.yieldReferencePercentage ?? 0)} de ${percent(reward.yieldReferenceRate ?? 0)} ${
				reward.yieldPeriod === "YEARLY" ? "ao ano" : "ao mês"
			}`,
		});
	return lines;
}

/** One-line summary of the most relevant parts of card rules. */
export function cardRulesSummary(rules: InstitutionCardRules | null | undefined) {
	const lines = describeCardRules(rules);
	const reward = lines.find(line => line.label === "Recompensa")?.value ?? "Nenhuma";
	return `${reward} - ${lines[0].value.toLowerCase()}`;
}
