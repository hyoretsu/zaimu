import { type ReactNode, useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DialogBody, DialogFooter } from "@/components/ui/Dialog";
import type { FinancialInstitutionYieldPolicy } from "@/lib/api";
import { showToast } from "@/stores";
import { YieldTaxFields } from "../YieldTaxFields";
import { InstitutionYieldRuleRow } from "./InstitutionYieldRuleRow";
import type { EditableYieldRule } from "./types";

const createRule = (): EditableYieldRule => ({
	fixedRate: "",
	id: crypto.randomUUID(),
	referencePercentage: "100",
	referenceType: "",
	upToBalance: "",
});
export function InstitutionYieldPolicyForm({
	policy,
	currency,
	controls,
	onSave,
	onDiscard,
}: {
	policy?: FinancialInstitutionYieldPolicy;
	currency: string;
	controls: ReactNode;
	onSave: (policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">) => Promise<unknown>;
	onDiscard: () => void;
}) {
	const [period, setPeriod] = useState<"MONTHLY" | "YEARLY">(policy?.yieldPeriod ?? "MONTHLY");
	const [taxIds, setTaxIds] = useState<string[]>(policy?.yieldTaxIds ?? []);
	const [taxRate, setTaxRate] = useState(String(policy?.yieldTaxRate ?? ""));
	const [rules, setRules] = useState<EditableYieldRule[]>(() =>
		policy?.rules.length
			? policy.rules.map(rule => ({
					fixedRate: String(rule.yieldFixedRate ?? ""),
					id: crypto.randomUUID(),
					referencePercentage: String(rule.yieldReferencePercentage ?? 100),
					referenceType: rule.yieldReferenceType ?? "",
					upToBalance: String(rule.upToBalance ?? ""),
				}))
			: [createRule()],
	);
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const updateRule = (id: string, rule: EditableYieldRule) =>
		setRules(current => current.map(item => (item.id === id ? rule : item)));
	return (
		<form
			className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
			onSubmit={async event => {
				event.preventDefault();
				if (pending) return;
				const data = new FormData(event.currentTarget);
				const numeric = (name: string) =>
					String(data.get(name) ?? "")
						.replace(/[^0-9,-]/g, "")
						.replace(",", ".");
				const submitted = rules.map((rule, index) => ({
					upToBalance:
						index === rules.length - 1
							? null
							: Number(data.get(`institution-yield-limit-${rule.id}-raw`)),
					yieldFixedRate: numeric(`institution-yield-fixed-${rule.id}`)
						? Number(numeric(`institution-yield-fixed-${rule.id}`))
						: null,
					yieldReferencePercentage: rule.referenceType
						? Number(numeric(`institution-yield-percentage-${rule.id}`))
						: null,
					yieldReferenceType: rule.referenceType || null,
				}));
				const submittedTax = numeric("institution-yield-tax");
				let previous = 0;
				for (const rule of submitted) {
					if (
						(rule.yieldFixedRate === null && !rule.yieldReferenceType) ||
						(rule.yieldFixedRate !== null &&
							(!Number.isFinite(rule.yieldFixedRate) || rule.yieldFixedRate <= 0)) ||
						(rule.yieldReferenceType &&
							(!Number.isFinite(rule.yieldReferencePercentage) ||
								!rule.yieldReferencePercentage ||
								rule.yieldReferencePercentage <= 0)) ||
						(rule.upToBalance !== null &&
							(!Number.isFinite(rule.upToBalance) || rule.upToBalance <= previous))
					) {
						setError(
							"Informe taxas positivas e limites crescentes. A última faixa cobre o saldo excedente.",
						);
						return;
					}
					if (rule.upToBalance !== null) previous = rule.upToBalance;
				}
				if (
					submittedTax &&
					(!Number.isFinite(Number(submittedTax)) ||
						Number(submittedTax) < 0 ||
						Number(submittedTax) > 100)
				) {
					setError("Informe imposto entre 0% e 100%.");
					return;
				}
				setPending(true);
				setError("");
				try {
					await onSave({
						rules: submitted,
						yieldPeriod: submitted.some(rule => rule.yieldFixedRate !== null) ? period : null,
						yieldTaxIds: taxIds,
						yieldTaxRate: submittedTax ? Number(submittedTax) : null,
					});
				} catch (cause) {
					setError(
						cause instanceof Error ? cause.message : "Não foi possível salvar o rendimento.",
					);
				} finally {
					setPending(false);
				}
			}}
		>
			<DialogBody>
				<fieldset className="min-w-0 space-y-4" disabled={pending}>
					{controls}
					<p className="text-muted-foreground text-sm">
						Limites em unidades da moeda de cada conta, sem conversão cambial.
					</p>
					<div className="">
						<div className="grid gap-4 pb-2">
							<div className="grid gap-4 sm:grid-cols-2">
								<CustomSelect
									label="Periodicidade da taxa fixa"
									onValueChange={value =>
										setPeriod(value === "YEARLY" ? "YEARLY" : "MONTHLY")
									}
									options={[
										{ label: "Mensal (21 dias úteis)", value: "MONTHLY" },
										{ label: "Anual (252 dias úteis)", value: "YEARLY" },
									]}
									placeholder="Selecione"
									required={rules.some(rule => Boolean(rule.fixedRate))}
									sortOptions={false}
									value={period}
								/>
								<YieldTaxFields
									id="institution-yield-tax"
									onTaxIdsChange={setTaxIds}
									onTaxRateChange={setTaxRate}
									taxIds={taxIds}
									taxRate={taxRate}
								/>
							</div>
							{rules.map((rule, index) => (
								<InstitutionYieldRuleRow
									currency={currency}
									index={index}
									isLast={index === rules.length - 1}
									key={rule.id}
									onChange={next => updateRule(rule.id, next)}
									onRemove={() =>
										setRules(current =>
											current.length === 1
												? current
												: current.filter(item => item.id !== rule.id),
										)
									}
									rule={rule}
								/>
							))}
							<ActionGroup>
								<Button
									className="cursor-pointer"
									disabled={rules.length >= 20}
									onClick={() => {
										setRules(current => [...current, createRule()]);
										showToast("Faixa adicionada à edição", "info");
									}}
									type="button"
									variant="outline"
								>
									<LuPlus /> Adicionar faixa
								</Button>
							</ActionGroup>
						</div>
					</div>
					{error && (
						<p className="text-destructive text-sm" role="alert">
							{error}
						</p>
					)}
				</fieldset>
			</DialogBody>
			<DialogFooter>
				<Button disabled={pending} onClick={onDiscard} type="button" variant="outline">
					Descartar
				</Button>
				<Button disabled={pending} type="submit">
					{pending ? "Salvando..." : "Salvar"}
				</Button>
			</DialogFooter>
		</form>
	);
}
