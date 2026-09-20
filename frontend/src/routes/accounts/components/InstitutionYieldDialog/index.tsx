import { type SyntheticEvent, useState } from "react";
import { LuBadgePercent, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { NumericField } from "@/components/ui/NumericField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialInstitution, FinancialInstitutionYieldPolicy } from "@/lib/api";
import { InstitutionYieldRuleRow } from "./InstitutionYieldRuleRow";
import type { EditableYieldRule } from "./types";

const createRule = (): EditableYieldRule => ({
	fixedRate: "",
	id: crypto.randomUUID(),
	referencePercentage: "100",
	referenceType: "",
	upToBalance: "",
});

export function InstitutionYieldDialog({
	institution,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onUpdate: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
}) {
	const latestPolicy = institution.yieldPolicies?.at(-1);
	const [open, setOpen] = useState(false);
	const [enabled, setEnabled] = useState(Boolean(latestPolicy?.rules.length));
	const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">(latestPolicy?.yieldPeriod ?? "MONTHLY");
	const [taxRate, setTaxRate] = useDebouncedInput(String(latestPolicy?.yieldTaxRate ?? ""), () => undefined);
	const [rules, setRules] = useState<EditableYieldRule[]>(
		() =>
			latestPolicy?.rules.map(rule => ({
				fixedRate: String(rule.yieldFixedRate ?? ""),
				id: crypto.randomUUID(),
				referencePercentage: String(rule.yieldReferencePercentage ?? 100),
				referenceType: rule.yieldReferenceType ?? "",
				upToBalance: String(rule.upToBalance ?? ""),
			})) ?? [createRule()],
	);
	const reset = () => {
		const policy = institution.yieldPolicies?.at(-1);
		setEnabled(Boolean(policy?.rules.length));
		setPeriod(policy?.yieldPeriod ?? "MONTHLY");
		setTaxRate(String(policy?.yieldTaxRate ?? ""));
		setRules(
			policy?.rules.map(rule => ({
				fixedRate: String(rule.yieldFixedRate ?? ""),
				id: crypto.randomUUID(),
				referencePercentage: String(rule.yieldReferencePercentage ?? 100),
				referenceType: rule.yieldReferenceType ?? "",
				upToBalance: String(rule.upToBalance ?? ""),
			})) ?? [createRule()],
		);
	};
	const updateRule = (id: string, rule: EditableYieldRule) =>
		setRules(current => current.map(item => (item.id === id ? rule : item)));
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		await onUpdate(institution, {
			rules: enabled
				? rules.map((rule, index) => ({
						upToBalance: index === rules.length - 1 ? null : Number(rule.upToBalance),
						yieldFixedRate: rule.fixedRate ? Number(rule.fixedRate) : null,
						yieldReferencePercentage: rule.referenceType ? Number(rule.referencePercentage) : null,
						yieldReferenceType: rule.referenceType || null,
					}))
				: [],
			yieldPeriod: enabled && rules.some(rule => Boolean(rule.fixedRate)) ? period : null,
			yieldTaxRate: enabled && taxRate ? Number(taxRate) : null,
		});
		setOpen(false);
	};
	return (
		<Dialog
			onOpenChange={nextOpen => {
				if (nextOpen) reset();
				setOpen(nextOpen);
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button className="cursor-pointer" size="sm" variant="outline">
					<LuBadgePercent /> Rendimento
				</Button>
			</DialogTrigger>
			<DialogContent className="flex max-h-[min(90vh,52rem)] flex-col sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Rendimento de {institution.name}</DialogTitle>
					<DialogDescription>
						Aplicado por faixas progressivas em contas correntes e poupanças sem regra própria.
					</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 flex-1 flex-col gap-5" onSubmit={submit}>
					<CheckboxField
						checkboxProps={{ checked: enabled, onCheckedChange: checked => setEnabled(checked === true) }}
					>
						Usar rendimento padrão nesta instituição
					</CheckboxField>
					{enabled && (
						<ScrollArea className="min-h-0 flex-1 pr-3">
							<div className="grid gap-4 pb-2">
								<div className="grid gap-4 sm:grid-cols-2">
									<CustomSelect
										label="Periodicidade"
										onValueChange={value => setPeriod(value as "MONTHLY" | "YEARLY")}
										options={[
											{ label: "Mensal (21 dias úteis)", value: "MONTHLY" },
											{ label: "Anual (252 dias úteis)", value: "YEARLY" },
										]}
										placeholder="Selecione"
										required={rules.some(rule => Boolean(rule.fixedRate))}
										sortOptions={false}
										value={period}
									/>
									<NumericField
										decimalScale={2}
										id={`institution-yield-tax-${institution.id}`}
										label="Imposto sobre rendimento"
										onValueChange={setTaxRate}
										placeholder="Ex: 15,00%"
										suffix="%"
										value={taxRate}
									/>
								</div>
								{rules.map((rule, index) => (
									<InstitutionYieldRuleRow
										index={index}
										isLast={index === rules.length - 1}
										key={rule.id}
										onChange={next => updateRule(rule.id, next)}
										onRemove={() =>
											setRules(current =>
												current.length === 1 ? current : current.filter(item => item.id !== rule.id),
											)
										}
										rule={rule}
									/>
								))}
								<Button
									className="cursor-pointer"
									onClick={() => setRules(current => [...current, createRule()])}
									type="button"
									variant="outline"
								>
									<LuPlus /> Adicionar faixa
								</Button>
							</div>
						</ScrollArea>
					)}
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => {
								reset();
								setOpen(false);
							}}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button
							className="cursor-pointer"
							disabled={
								enabled &&
								rules.some(
									(rule, index) =>
										(!rule.fixedRate && !rule.referenceType) ||
										(index < rules.length - 1 && !rule.upToBalance),
								)
							}
							type="submit"
						>
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
