import { useQuery } from "@tanstack/react-query";
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
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { Category } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import type { MonthlyBudget, MonthlyBudgetInput } from "@/lib/monthly-budget-service";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { BudgetAmountField } from "./BudgetAmountField";

type BudgetInput = MonthlyBudgetInput;

export function BudgetDialog({
	item,
	adjustment = false,
	month,
	pending,
	onClose,
	onSave,
}: {
	item?: MonthlyBudget;
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
					source: item.source,
					startMonth: item.startMonth,
				}
			: {
					amount: 0,
					categoryId: null,
					currency,
					endMonth: null,
					name: "",
					source: "STATEMENTS",
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
						if (name.trim() && amount > 0 && draft.startMonth && (draft.source !== "TAG" || draft.categoryId))
							onSave({ ...draft, amount, name: name.trim() });
					}}
				>
					<DialogBody>
						<div className="space-y-4">
							{!adjustment && (
								<>
									{" "}
									<div className="grid gap-2">
										<Label htmlFor="budget-name">
											<span>
												Nome <RequiredMark />
											</span>
										</Label>
										<Input
											disabled={pending}
											id="budget-name"
											maxLength={100}
											name="budget-name"
											onChange={event => setName(event.currentTarget.value)}
											placeholder="Ex: Contas da casa"
											required
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
											{ label: "Faturas de todos os cartões", value: "STATEMENTS" },
											{ label: "Gastos com uma tag", value: "TAG" },
											{ label: "Reserva sem tag", value: "CUSTOM" },
										]}
										placeholder="Ex: Faturas de cartão"
										required
										value={draft.source}
									/>
									{draft.source === "TAG" && (
										<CustomSelect
											disabled={pending}
											error={categories.isError ? "Falha ao carregar tags." : undefined}
											isLoading={categories.isPending}
											label="Tag"
											onRetry={() => void categories.refetch()}
											onValueChange={categoryId => setDraft(current => ({ ...current, categoryId }))}
											options={(categories.data ?? []).map(category => ({
												label: category.name,
												value: category.id,
											}))}
											placeholder="Ex: Contas"
											required
											searchable
											value={draft.categoryId ?? ""}
										/>
									)}
									<p className="text-muted-foreground text-sm">
										Faturas somam todos os cartões. Tags consideram despesas fora dos cartões e suas
										recorrências associadas. Compras de cartão entram nas faturas. A reserva cobre somente o
										valor ainda não comprometido; se o gasto superar a previsão, prevalece o gasto.
									</p>
								</>
							)}
							{adjustment && (
								<p className="text-muted-foreground text-sm">
									{item?.name}: ajuste somente para {month}. Outros meses mantêm orçamento padrão.
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
								pending || !name.trim() || !draft.startMonth || (draft.source === "TAG" && !draft.categoryId)
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
