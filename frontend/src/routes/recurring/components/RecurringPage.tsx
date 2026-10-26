import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { HiArrowDown, HiArrowPath, HiArrowUp, HiPlus } from "react-icons/hi2";
import { z } from "zod";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { useUrlViewSet, useUrlViewState } from "@/hooks/use-url-view-state";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	AdvanceRecurringDialog,
	CreateRecurringDialog,
	DeleteRecurringDialog,
	EditRecurringDialog,
	HiddenRecurrencesToggle,
	isRecurrenceEnded,
	recurrenceToListItem,
	type RecurringDirection,
	RecurringListItem,
	type RecurringListItemData,
	RecurringSummary,
} from "@/routes/recurring/components";
import { showToast } from "@/stores";

type DirectionFilter = "all" | RecurringDirection;

const filterOptions = [
	{ icon: null, id: "all", label: "Todas" },
	{ icon: HiArrowDown, id: "INCOME", label: "Entradas" },
	{ icon: HiArrowUp, id: "EXPENSE", label: "Saídas" },
	{ icon: HiArrowPath, id: "TRANSFER", label: "Transferências" },
] as const;

export function RecurringPage() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [filter, setFilter] = useUrlViewState<DirectionFilter>(
		"type",
		"all",
		z.enum(["all", "INCOME", "EXPENSE", "TRANSFER"]),
	);
	const [expandedInactiveSections, setExpandedInactiveSections] = useUrlViewSet("sections");
	const [pendingIds, setPendingIds] = useState<Set<string>>(() => new Set());
	const markPending = (id: string, pending: boolean) =>
		setPendingIds(current => {
			const next = new Set(current);
			if (pending) next.add(id);
			else next.delete(id);
			return next;
		});
	const [isCreateOpen, setIsCreateOpen] = useState(false);
	const [editingItem, setEditingItem] = useState<RecurringListItemData>();
	const [advancingItem, setAdvancingItem] = useState<RecurringListItemData>();
	const [deletingItem, setDeletingItem] = useState<RecurringListItemData>();
	const [recoveredAdvanceTime, setRecoveredAdvanceTime] = useState<string>();
	const [recoveredDeleteChoice, setRecoveredDeleteChoice] = useState<boolean>();
	const pendingModalActions = useModalRecoveryStore(state => state.pending);
	useBackgroundModalRecovery<{ item: RecurringListItemData; time?: string }>(
		"recurrence-advance",
		entry => {
			setRecoveredAdvanceTime(entry.payload.time);
			setAdvancingItem(entry.payload.item);
		},
	);
	useBackgroundModalRecovery<{ item: RecurringListItemData; deleteTransactions: boolean }>(
		"recurrence-delete",
		entry => {
			setRecoveredDeleteChoice(entry.payload.deleteTransactions);
			setDeletingItem(entry.payload.item);
		},
	);
	const accountsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const recurringQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.recurrences.getAll(),
		queryKey: queryKeys.recurring.all(identity!),
	});
	const toggle = useMutation({
		meta: { cacheOperations: ["recurring"] },
		mutationFn: (item: RecurringListItemData) =>
			dataService.recurrences.update(item.id, { isActive: !item.active }),
		onError: error => showToast(error.message, "negative"),
		onMutate: item => markPending(item.id, true),
		onSettled: (_, __, item) => markPending(item.id, false),
		onSuccess: async (_, item) => {
			showToast(item.active ? "Recorrência pausada." : "Recorrência retomada.", "positive");
		},
	});
	const submitAdvance = (item: RecurringListItemData, time?: string) =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["recurring"] },
			close: () => {
				setAdvancingItem(undefined);
				setRecoveredAdvanceTime(undefined);
			},
			conflictKey: `recurrence:${item.id}`,
			failureMessage: "Não foi possível adiantar a ocorrência.",
			loadingMessage: "Adiantando ocorrência...",
			recovery: { entityId: item.id, kind: "recurrence-advance", payload: { item, time } },
			run: () => dataService.recurrences.advance(item.id, time),
			successMessage: "Próxima ocorrência adiantada para hoje.",
		});
	const submitDelete = (item: RecurringListItemData, deleteTransactions: boolean) =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["recurring"] },
			close: () => {
				setDeletingItem(undefined);
				setRecoveredDeleteChoice(undefined);
			},
			conflictKey: `recurrence:${item.id}`,
			failureMessage: "Não foi possível excluir a recorrência.",
			loadingMessage: "Excluindo recorrência...",
			recovery: { entityId: item.id, kind: "recurrence-delete", payload: { deleteTransactions, item } },
			run: () => dataService.recurrences.delete(item.id, deleteTransactions),
			successMessage: "Recorrência excluída.",
		});

	const isPending = accountsQuery.isPending || recurringQuery.isPending;
	const isError =
		(accountsQuery.isError && accountsQuery.data === undefined) ||
		(recurringQuery.isError && recurringQuery.data === undefined);
	const monthStart = format(startOfMonth(new Date()), "yyyy-MM-dd");
	const monthEnd = format(endOfMonth(new Date()), "yyyy-MM-dd");
	const periodLabel = new Intl.DateTimeFormat("pt-BR", { month: "long", year: "numeric" }).format(
		new Date(),
	);
	const items = (recurringQuery.data ?? [])
		.map(recurrence => recurrenceToListItem(recurrence, accountsQuery.data ?? [], monthStart, monthEnd))
		.sort(
			(left, right) =>
				Number(right.active) - Number(left.active) || left.title.localeCompare(right.title, "pt-BR"),
		);
	const filteredItems = items.filter(item => filter === "all" || item.direction === filter);
	const activeItems = filteredItems.filter(item => item.active && !isRecurrenceEnded(item.endDate));
	const pausedItems = filteredItems.filter(item => !item.active && !isRecurrenceEnded(item.endDate));
	const endedItems = filteredItems.filter(item => isRecurrenceEnded(item.endDate));
	const monetaryItems = items.filter(item => item.active && !isRecurrenceEnded(item.endDate));
	const renderItem = (item: RecurringListItemData) => (
		<RecurringListItem
			deleting={!!pendingModalActions[`${identity}:recurrence:${item.id}`]}
			item={item}
			key={`${item.source}:${item.id}`}
			onAdvance={() => setAdvancingItem(item)}
			onDelete={() => setDeletingItem(item)}
			onEdit={() => setEditingItem(item)}
			onToggle={() => {
				if (!isRecurrenceEnded(item.endDate)) toggle.mutate(item);
			}}
			toggling={pendingIds.has(item.id) || !!pendingModalActions[`${identity}:recurrence:${item.id}`]}
		/>
	);
	const toggleInactiveSection = (section: "ended" | "paused") => {
		setExpandedInactiveSections(current => {
			const next = new Set(current);
			if (next.has(section)) next.delete(section);
			else next.add(section);
			return next;
		});
	};

	return (
		<PageContainer className="space-y-6">
			<PageHeader
				actions={[
					{
						disabled: !!pendingModalActions[`${identity}:recurrence:new`],
						icon: HiPlus,
						label: "Adicionar",
						onClick: () => setIsCreateOpen(true),
						variant: "default",
					},
				]}
				backTo="/more"
				description="Agende entradas, saídas, compras e transferências em um único fluxo."
				title="Recorrências"
			/>

			{isPending ? (
				<div className="grid gap-3 sm:grid-cols-2">
					<Skeleton className="h-[74px] rounded-2xl" />
					<Skeleton className="h-[74px] rounded-2xl" />
				</div>
			) : (
				<div className="space-y-3">
					<RecurringSummary
						currencyCode="BRL"
						expenses={0}
						incomes={0}
						period={periodLabel}
						values={monetaryItems.map(item => ({
							amount: item.monthlyAmount,
							currency: item.recurrence?.currency ?? "BRL",
							direction: item.direction,
						}))}
					/>
				</div>
			)}

			<div className="bg-card grid gap-2 rounded-2xl border p-2 min-[440px]:grid-cols-4">
				{filterOptions.map(option => (
					<Button
						className="w-full cursor-pointer"
						key={option.id}
						onClick={() => setFilter(option.id)}
						variant={filter === option.id ? "default" : "outline"}
					>
						{option.icon && <option.icon />}
						{option.label}
					</Button>
				))}
			</div>

			<QueryRefreshStatus
				error={!isError && (accountsQuery.isError || recurringQuery.isError)}
				onRetry={() => Promise.all([accountsQuery.refetch(), recurringQuery.refetch()])}
				pending={!isPending && (accountsQuery.isFetching || recurringQuery.isFetching)}
			/>
			{isPending ? (
				<div className="space-y-5">
					{[1, 2].map(section => (
						<div className="space-y-2" key={section}>
							<Skeleton className="h-4 w-28" />
							<Skeleton className="h-36 rounded-2xl" />
						</div>
					))}
				</div>
			) : isError ? (
				<EmptyState
					description="Não foi possível carregar recorrências."
					icon={<HiArrowPath />}
					title="Falha ao carregar recorrências"
				/>
			) : filteredItems.length === 0 ? (
				<EmptyState
					action={
						<Button
							className="cursor-pointer"
							disabled={!!pendingModalActions[`${identity}:recurrence:new`]}
							onClick={() => setIsCreateOpen(true)}
						>
							<HiPlus /> Adicionar recorrência
						</Button>
					}
					description={
						items.length === 0
							? "Cadastre uma entrada ou saída recorrente para começar."
							: "Nenhuma recorrência corresponde ao filtro selecionado."
					}
					icon={<HiArrowPath />}
					title="Nenhuma recorrência"
				/>
			) : (
				<div className="space-y-5">
					{pausedItems.length > 0 && (
						<section className="space-y-2">
							<HiddenRecurrencesToggle
								expanded={expandedInactiveSections.has("paused")}
								hiddenCount={pausedItems.length}
								label="Pausadas"
								onClick={() => toggleInactiveSection("paused")}
							/>
							{expandedInactiveSections.has("paused") && (
								<div className="bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
									{pausedItems.map(renderItem)}
								</div>
							)}
						</section>
					)}
					{activeItems.length > 0 && (
						<section className="space-y-2">
							<h2 className="text-muted-foreground text-sm font-medium">Ativas</h2>
							<div className="bg-card divide-y rounded-2xl border shadow-sm">
								{activeItems.map(renderItem)}
							</div>
						</section>
					)}
					{endedItems.length > 0 && (
						<section className="space-y-2">
							<HiddenRecurrencesToggle
								expanded={expandedInactiveSections.has("ended")}
								hiddenCount={endedItems.length}
								label="Encerradas"
								onClick={() => toggleInactiveSection("ended")}
							/>
							{expandedInactiveSections.has("ended") && (
								<div className="bg-card divide-y overflow-hidden rounded-2xl border shadow-sm">
									{endedItems.map(renderItem)}
								</div>
							)}
						</section>
					)}
				</div>
			)}

			<CreateRecurringDialog onOpenChange={setIsCreateOpen} open={isCreateOpen} />
			{advancingItem && (
				<AdvanceRecurringDialog
					initialTime={recoveredAdvanceTime}
					item={advancingItem}
					onAdvance={time => submitAdvance(advancingItem, time)}
					onOpenChange={open => {
						if (!open) {
							setAdvancingItem(undefined);
							setRecoveredAdvanceTime(undefined);
						}
					}}
					pending={false}
				/>
			)}
			{editingItem && (
				<EditRecurringDialog
					item={editingItem}
					key={`${editingItem.source}:${editingItem.id}`}
					onOpenChange={open => {
						if (!open) setEditingItem(undefined);
					}}
				/>
			)}
			{deletingItem && (
				<DeleteRecurringDialog
					deleting={false}
					initialDeleteTransactions={recoveredDeleteChoice}
					item={deletingItem}
					onDelete={deleteTransactions => submitDelete(deletingItem, deleteTransactions)}
					onOpenChange={open => {
						if (!open) {
							setDeletingItem(undefined);
							setRecoveredDeleteChoice(undefined);
						}
					}}
				/>
			)}
		</PageContainer>
	);
}
