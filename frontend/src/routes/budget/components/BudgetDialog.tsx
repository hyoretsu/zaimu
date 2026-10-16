import { useQuery } from "@tanstack/react-query";
import { isMonthlyAdjustment, sameBudgetPlan, validateBudgetHierarchy } from "@zaimu/finance/monthly-budget";
import { useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Input } from "@/components/ui/Input";
import { Label } from "@/components/ui/Label";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { Category } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import type { MonthlyBudget, MonthlyBudgetInput } from "@/lib/monthly-budget-service";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { BudgetAmountField } from "./BudgetAmountField";
import { budgetSourceLabel } from "./budget-display";

type BudgetInput = MonthlyBudgetInput;

export function BudgetDialog({
	item,
	budgets = [],
	adjustment = false,
	month,
	pending,
	onClose,
	onSave,
}: {
	item?: MonthlyBudget;
	budgets?: MonthlyBudget[];
	adjustment?: boolean;
	month: string;
	pending: boolean;
	onClose: () => void;
	onSave: (value: BudgetInput) => void;
}) {
	const currency = useCurrencyStore(state => state.currency);
	const identity = useCacheIdentity();
	const [draft, setDraft] = useState<BudgetInput>(() =>
		item
			? {
					amount: item.amount,
					categoryId: item.categoryId,
					currency: item.currency,
					endMonth: item.endMonth,
					name: item.name,
					parentBudgetId: item.parentBudgetId ?? null,
					source: item.source,
					startMonth: item.startMonth,
				}
			: {
					amount: 0,
					categoryId: null,
					currency,
					endMonth: null,
					name: "",
					parentBudgetId: null,
					source: "UNCATEGORIZED",
					startMonth: month,
				},
	);
	const [name, setName] = useDebouncedInput(draft.name, value =>
		setDraft(current => ({ ...current, name: value })),
	);
	const categories = useQuery({
		enabled: identity !== null && draft.source === "TAG",
		queryFn: async () => {
			const items: Category[] = [];
			let cursor: string | undefined;
			do {
				const page = await dataService.categories.getPage({ cursor, limit: 100 });
				items.push(...page.items);
				cursor = page.nextCursor ?? undefined;
			} while (cursor);
			return items;
		},
		queryKey: ["budget-category-options", identity],
	});
	const isUnavailable = (candidate: BudgetInput) =>
		candidate.source !== "CUSTOM" &&
		budgets.some(
			budget =>
				budget.id !== item?.id &&
				sameBudgetPlan(budget, candidate) &&
				isMonthlyAdjustment(budget) === isMonthlyAdjustment(candidate) &&
				budget.startMonth <= (candidate.endMonth ?? "9999-12") &&
				candidate.startMonth <= (budget.endMonth ?? "9999-12"),
		);
	const unavailable = isUnavailable(draft);
	const parentOptions = budgets.filter(candidate => {
		if (isMonthlyAdjustment(candidate)) return false;
		try {
			validateBudgetHierarchy(
				budgets,
				{ ...draft, amount: draft.amount ?? 0, parentBudgetId: candidate.id },
				item?.id,
			);
			return true;
		} catch {
			return false;
		}
	});
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !pending) onClose();
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>
						{adjustment
							? `Ajustar orçamento - ${month}`
							: item
								? "Editar orçamento padrão"
								: "Novo orçamento padrão"}
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col gap-6"
					onSubmit={event => {
						event.preventDefault();
						const amount = Number(new FormData(event.currentTarget).get("budget-amount-raw"));
						if (
							!unavailable &&
							(amount > 0 || (draft.source === "UNCATEGORIZED" && amount === 0)) &&
							draft.startMonth &&
							(draft.source !== "TAG" || draft.categoryId)
						)
							onSave({ ...draft, amount, name: name.trim() });
					}}
				>
					<DialogBody>
						<div className="space-y-4">
							{!adjustment && (
								<>
									{" "}
									<div className="grid gap-2">
										<Label htmlFor="budget-name">Nome</Label>
										<Input
											disabled={pending}
											id="budget-name"
											maxLength={100}
											name="budget-name"
											onChange={event => setName(event.currentTarget.value)}
											placeholder="Ex: Contas da casa"
											type="text"
											value={name}
										/>
									</div>
									<CustomSelect
										disabled={pending}
										label="Categoria de planejamento"
										onValueChange={value =>
											setDraft(current => ({
												...current,
												categoryId: null,
												source: value as MonthlyBudget["source"],
											}))
										}
										options={[
											...(!isUnavailable({ ...draft, categoryId: null, source: "STATEMENTS" })
												? [{ label: "Faturas", value: "STATEMENTS" }]
												: []),
											{ label: "Etiqueta", value: "TAG" },
											{ label: "Título", value: "CUSTOM" },
											{ label: "Reserva", value: "RESERVE" },
											{ label: "Sem categoria", value: "UNCATEGORIZED" },
										]}
										placeholder="Ex: Faturas de cartão"
										required
										value={draft.source === "STATEMENTS" && unavailable ? "" : draft.source}
									/>
									{draft.source === "UNCATEGORIZED" && (
										<p className="text-muted-foreground text-sm">
											Apenas para organização, sem conciliação automática de despesas.
										</p>
									)}
									{draft.source === "CUSTOM" && (
										<p className="text-muted-foreground text-sm">
											Despesas e transferências com descrição igual ao nome abatem este orçamento.
										</p>
									)}
									{draft.source === "TAG" && (
										<CustomSelect
											disabled={pending}
											error={categories.isError ? "Falha ao carregar etiquetas." : undefined}
											isLoading={categories.isPending}
											label="Etiqueta"
											onRetry={() => void categories.refetch()}
											onValueChange={categoryId => setDraft(current => ({ ...current, categoryId }))}
											options={(categories.data ?? [])
												.filter(category => !isUnavailable({ ...draft, categoryId: category.id }))
												.map(category => ({
													label: category.name,
													value: category.id,
												}))}
											placeholder="Ex: Contas"
											required
											searchable
											value={unavailable ? "" : (draft.categoryId ?? "")}
										/>
									)}
								</>
							)}
							{!adjustment && (
								<div className="space-y-2">
									<CustomSelect
										disabled={pending}
										label="Dentro de outro orçamento"
										onValueChange={value =>
											setDraft(current => ({ ...current, parentBudgetId: value === "none" ? null : value }))
										}
										options={[
											{ label: "Independente", special: true, value: "none" },
											...parentOptions.map(parent => ({
												label: parent.name || budgetSourceLabel(parent),
												value: parent.id,
											})),
										]}
										placeholder="Ex: Faturas"
										searchable
										value={draft.parentBudgetId ?? "none"}
									/>
									<p className="text-muted-foreground text-xs">
										Valor incluído no orçamento principal. Somente excedentes aumentam o total.
									</p>
								</div>
							)}
							{adjustment && (
								<p className="text-muted-foreground text-sm">
									{item?.name || "Planejamento"}: ajuste somente para {month}. Outros meses mantêm orçamento
									padrão.
								</p>
							)}
							<FormFieldRow>
								<CurrencySelect
									disabled={pending || adjustment}
									onValueChange={currency => setDraft(current => ({ ...current, currency }))}
									value={draft.currency}
								/>
								<BudgetAmountField
									currency={draft.currency}
									disabled={pending}
									onChange={amount => setDraft(current => ({ ...current, amount }))}
									required={draft.source !== "UNCATEGORIZED"}
									value={draft.amount}
								/>
							</FormFieldRow>
							{!adjustment && (
								<FormFieldRow>
									<DateField
										description="Vale para o mês da data escolhida."
										disabled={pending}
										id="budget-start"
										label="Início"
										name="budget-start"
										onValueChange={value =>
											setDraft(current => ({ ...current, startMonth: value.slice(0, 7) }))
										}
										required
										value={draft.startMonth ? `${draft.startMonth}-01` : ""}
									/>
									<DateField
										description="Sem data final, repete a cada mês."
										disabled={pending}
										id="budget-end"
										label="Fim"
										min={draft.startMonth ? `${draft.startMonth}-01` : undefined}
										name="budget-end"
										onValueChange={value =>
											setDraft(current => ({ ...current, endMonth: value ? value.slice(0, 7) : null }))
										}
										value={draft.endMonth ? `${draft.endMonth}-01` : ""}
									/>
								</FormFieldRow>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button disabled={pending} onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							disabled={
								pending || unavailable || !draft.startMonth || (draft.source === "TAG" && !draft.categoryId)
							}
							type="submit"
						>
							{pending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
