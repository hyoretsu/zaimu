import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { isMonthlyAdjustment } from "@zaimu/finance/monthly-budget";
import { format } from "date-fns";
import { useState } from "react";
import { LuCalendarDays, LuPlus, LuWallet } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import {
	type MonthlyBudget,
	type MonthlyBudgetInput,
	monthlyBudgetService,
} from "@/lib/monthly-budget-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { BudgetAdjustmentsDialog } from "./BudgetAdjustmentsDialog";
import { BudgetDialog } from "./BudgetDialog";
import { BudgetItem } from "./BudgetItem";
import { BudgetOverview } from "./BudgetOverview";

export function BudgetPage() {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [month, setMonth] = useState(() => format(new Date(), "yyyy-MM"));
	const [editing, setEditing] = useState<MonthlyBudget | "new" | null>(null);
	const [adjustmentsOpen, setAdjustmentsOpen] = useState(false);
	const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
	const budgets = useQuery({
		enabled: identity !== null,
		queryFn: () => monthlyBudgetService.getAll(),
		queryKey: queryKeys.budgets.list(identity!),
	});
	const invalidate = () =>
		Promise.all([
			client.invalidateQueries({ queryKey: queryKeys.budgets.all(identity!) }),
			client.invalidateQueries({ queryKey: queryKeys.dashboard.all(identity!) }),
		]);
	const save = useMutation({
		mutationFn: ({ value, id }: { value: MonthlyBudgetInput; id?: string }) =>
			id ? monthlyBudgetService.update(id, value) : monthlyBudgetService.create(value),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidate();
			setEditing(null);
			showToast("Planejamento salvo.", "positive");
		},
	});
	const remove = useMutation({
		mutationFn: (id: string) => monthlyBudgetService.delete(id),
		onError: error => showToast(error.message, "negative"),
		onMutate: id => setPendingIds(current => new Set([...current, id])),
		onSettled: (_, __, id) =>
			setPendingIds(current => {
				const next = new Set(current);
				next.delete(id);
				return next;
			}),
		onSuccess: async () => {
			await invalidate();
			showToast("Planejamento excluído.", "positive");
		},
	});
	const defaults = (budgets.data ?? []).filter(item => !isMonthlyAdjustment(item));
	const error = budgets.isError && !budgets.data;
	const busyIds = new Set(pendingIds);
	if (save.isPending && editing && editing !== "new") busyIds.add(editing.id);
	const editor = editing ? (
		<BudgetDialog
			item={editing === "new" ? undefined : editing}
			key={editing === "new" ? "new" : editing.id}
			month={month}
			onClose={() => setEditing(null)}
			onSave={value => save.mutate({ id: editing !== "new" ? editing.id : undefined, value })}
			pending={save.isPending}
		/>
	) : null;
	return (
		<PageContainer className="space-y-6">
			<PageHeader
				actions={[
					{
						icon: LuPlus,
						label: "Adicionar",
						onClick: () => {
							setEditing("new");
						},
						variant: "default",
					},
				]}
				backTo="/more"
				description="Seu plano geral de despesas, mês a mês."
				title="Orçamento mensal"
			/>
			<BudgetOverview month={month} onMonthChange={setMonth} />
			<section aria-label="Plano geral" className="space-y-3">
				<div className="flex flex-wrap items-center justify-between gap-3">
					<h2 className="font-semibold">Plano geral</h2>
					<ActionGroup>
						<Button
							disabled={budgets.isPending || error}
							onClick={() => setAdjustmentsOpen(true)}
							size="sm"
							variant="outline"
						>
							<LuCalendarDays />
							Ajustes por mês
						</Button>
					</ActionGroup>
				</div>
				{(budgets.isFetching && !budgets.isPending) || (budgets.isError && !error) ? (
					<QueryRefreshStatus
						error={budgets.isError}
						onRetry={() => budgets.refetch()}
						pending={budgets.isFetching}
					/>
				) : null}
				{budgets.isPending ? (
					<div className="space-y-2">
						{[1, 2, 3].map(key => (
							<Skeleton className="h-16 rounded-xl" key={key} />
						))}
					</div>
				) : error ? (
					<EmptyState
						action={
							<Button
								onClick={() => {
									void budgets.refetch();
									showToast("Atualização solicitada.", "info");
								}}
								variant="outline"
							>
								Tentar novamente
							</Button>
						}
						description="Tente novamente para consultar seu planejamento."
						icon={<LuWallet />}
						title="Falha ao carregar plano geral"
					/>
				) : !defaults.length ? (
					<p className="py-5 text-muted-foreground text-sm">
						Nenhum item no plano geral. Use Adicionar para planejar suas despesas.
					</p>
				) : (
					<ul className="divide-y rounded-xl border">
						{defaults.map(item => (
							<BudgetItem
								item={item}
								key={item.id}
								onDelete={() => remove.mutate(item.id)}
								onEdit={() => {
									setEditing(item);
								}}
								pending={busyIds.has(item.id)}
							/>
						))}
					</ul>
				)}
			</section>
			{adjustmentsOpen && (
				<BudgetAdjustmentsDialog
					budgets={budgets.data ?? []}
					month={month}
					onClose={() => setAdjustmentsOpen(false)}
					onMonthChange={setMonth}
					onRemove={id => remove.mutate(id)}
					onSave={(value, id) => save.mutateAsync({ id, value })}
					pendingIds={busyIds}
					saving={save.isPending}
				/>
			)}
			{!adjustmentsOpen && editor}
		</PageContainer>
	);
}
