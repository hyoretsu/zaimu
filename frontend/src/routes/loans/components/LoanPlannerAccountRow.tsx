import type { PlannerAccount, PlannerEligibility } from "@zaimu/finance/loan-planner";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { LoanSection } from "./LoanSection";
export function LoanPlannerAccountRow({
	account,
	name,
	rule,
	from,
	onRule,
	onAccount,
}: {
	account: PlannerAccount;
	name: string;
	rule: PlannerEligibility;
	from: string;
	onRule: (rule: PlannerEligibility) => void;
	onAccount: (account: PlannerAccount) => void;
}) {
	const toggle = (field: "includeAccountIds" | "excludeAccountIds" | "accountIds", checked: boolean) =>
		onRule({
			...rule,
			[field]: checked
				? [...new Set([...rule[field], account.id])]
				: rule[field].filter(id => id !== account.id),
		});
	return (
		<LoanSection
			summary={
				rule.excludeAccountIds.includes(account.id)
					? "Excluída explicitamente"
					: rule.includeAccountIds.includes(account.id)
						? "Incluída explicitamente"
						: account.type === "SAVINGS" || account.type === "INVESTMENT"
							? "Investimento - exclusão padrão"
							: "Segue seleção geral"
			}
			title={name}
		>
			<CheckboxField
				checkboxProps={{
					checked: rule.accountIds.includes(account.id),
					disabled: rule.allAccounts,
					onCheckedChange: c => toggle("accountIds", c === true),
				}}
			>
				Selecionada na lista de contas
			</CheckboxField>
			<CheckboxField
				checkboxProps={{
					checked: rule.includeAccountIds.includes(account.id),
					onCheckedChange: c => toggle("includeAccountIds", c === true),
				}}
			>
				Incluir especificamente, inclusive investimentos
			</CheckboxField>
			<CheckboxField
				checkboxProps={{
					checked: rule.excludeAccountIds.includes(account.id),
					onCheckedChange: c => toggle("excludeAccountIds", c === true),
				}}
			>
				Excluir especificamente - prevalece sobre inclusões
			</CheckboxField>
			<FormFieldRow>
				<DateField
					id={`liquidity-date-${account.id}`}
					label="Disponível a partir de"
					name={`liquidity-date-${account.id}`}
					onValueChange={v => onAccount({ ...account, availableFrom: v })}
					value={account.availableFrom ?? from}
				/>
				<NumericField
					decimalScale={0}
					id={`liquidity-days-${account.id}`}
					label="Prazo de resgate em dias corridos"
					onValueChange={v => onAccount({ ...account, redemptionDays: Number(v) })}
					placeholder="Ex: 30"
					value={String(account.redemptionDays ?? 0)}
				/>
				<MoneyField
					currencyCode={account.currency ?? "BRL"}
					id={`liquidity-cost-${account.id}`}
					label="Custo por resgate"
					onValueChange={v => onAccount({ ...account, redemptionCost: Number(v) })}
					value={String(account.redemptionCost ?? 0)}
				/>
			</FormFieldRow>
		</LoanSection>
	);
}
