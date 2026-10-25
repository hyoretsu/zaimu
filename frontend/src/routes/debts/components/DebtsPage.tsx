import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus, LuUsersRound } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { PendingNotices } from "@/components/pending-notices";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { DebtEvent, DebtPerson } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { compareDebtPersonNames } from "@/lib/debt-split";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	CreateDebtDialog,
	type CreateDebtOriginDraft,
	DebtPersonCard,
	EditDebtPersonDialog,
	type UpdateDebtOriginDraft,
} from "@/routes/debts/components";
import { showToast } from "@/stores";

const formatTotals = (
	rows: { currency: string; iOwe: number; net: number; owedToMe: number }[],
	field: "net" | "iOwe" | "owedToMe",
) => <PreferredMoneyAmount values={rows.map(row => ({ amount: row[field], currency: row.currency }))} />;
export function DebtsPage() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [createOpen, setCreateOpen] = useState(false);
	const [createPersonId, setCreatePersonId] = useState<string>();
	const [recoveredCreate, setRecoveredCreate] = useState<CreateDebtOriginDraft>();
	const createPending = useModalRecoveryStore(state => !!state.pending[`${identity}:debt-create`]);
	useBackgroundModalRecovery<CreateDebtOriginDraft>("debt-create", entry => {
		setCreatePersonId(undefined);
		setRecoveredCreate(entry.payload);
		setCreateOpen(true);
	});
	const [editing, setEditing] = useState<{ event: DebtEvent; personId: string } | null>(null);
	const [recoveredEdit, setRecoveredEdit] = useState<UpdateDebtOriginDraft>();
	useBackgroundModalRecovery<UpdateDebtOriginDraft>("debt-edit", entry => {
		setRecoveredEdit(entry.payload);
		setEditing({ event: { id: entry.entityId } as DebtEvent, personId: entry.payload.personId });
	});
	const [editingPerson, setEditingPerson] = useState<DebtPerson | null>(null);
	const pending = useModalRecoveryStore(state => state.pending);
	const ledger = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getLedger(),
		queryKey: queryKeys.debts.ledger(identity!),
	});
	const refresh = () => invalidateCacheOperation(queryClient, identity!, "debt");
	const deletePerson = useMutation({
		meta: { cacheOperations: ["debt"] },
		mutationFn: (id: string) => dataService.debts.deletePerson(id),
		onSuccess: async () => {
			showToast("Pessoa excluída.", "info");
		},
	});
	const deleteEvent = useMutation({
		meta: { cacheOperations: ["debt"] },
		mutationFn: (id: string) => dataService.debts.deleteEvent(id),
		onSuccess: async () => {
			showToast("Lançamento excluído.", "info");
		},
	});
	const [recoveredPerson, setRecoveredPerson] = useState<{ accountEmail: string; name: string }>();
	useBackgroundModalRecovery<{ person: DebtPerson; draft: { accountEmail: string; name: string } }>(
		"debt-person",
		entry => {
			setRecoveredPerson(entry.payload.draft);
			setEditingPerson(entry.payload.person);
		},
	);

	const people = (ledger.data?.people ?? []).toSorted((left, right) =>
		compareDebtPersonNames(left.name, right.name),
	);

	const pageHeader = (
		<PageHeader
			actions={
				ledger.data
					? [
							{
								disabled: createPending,
								icon: LuPlus,
								label: "Adicionar lançamento",
								onClick: () => {
									setCreatePersonId(undefined);
									setCreateOpen(true);
								},
								variant: "default",
							},
						]
					: undefined
			}
			backTo="/more"
			className="mb-6"
			description="Acompanhe valores a pagar e a receber de outras pessoas."
			title="Dívidas"
		/>
	);

	if (ledger.isPending)
		return (
			<div className="mx-auto grid min-h-screen w-full max-w-5xl gap-4 p-4 lg:py-10">
				{pageHeader}
				<Skeleton className="h-56 rounded-3xl" />
				{[1, 2, 3].map(item => (
					<Skeleton className="h-28 rounded-2xl" key={item} />
				))}
			</div>
		);

	if (ledger.isError && ledger.data === undefined)
		return (
			<div className="mx-auto max-w-5xl p-4" role="alert">
				{pageHeader}
				<p>Não foi possível carregar os saldos.</p>
				<Button className="mt-3 cursor-pointer" onClick={() => ledger.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</div>
		);

	return (
		<main className="mx-auto min-h-screen w-full max-w-5xl overflow-x-clip bg-background pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:py-10">
			<div className="px-4">{pageHeader}</div>
			<QueryRefreshStatus
				error={ledger.isError}
				onRetry={() => ledger.refetch()}
				pending={ledger.isFetching}
			/>
			<section className="mx-4 min-w-0 rounded-3xl bg-gradient-to-br from-primary to-primary/75 p-5 text-primary-foreground shadow-lg sm:p-6 lg:p-8">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-primary-foreground/70 text-sm">Saldo líquido</p>
						<p className="font-bold text-3xl sm:text-4xl">
							{formatTotals(
								ledger.data?.totalsByCurrency ?? [
									{ currency: "BRL", ...(ledger.data?.totals ?? { iOwe: 0, net: 0, owedToMe: 0 }) },
								],
								"net",
							)}
						</p>
					</div>
				</div>
				<div className="mt-6 grid grid-cols-2 gap-4 border-primary-foreground/20 border-t pt-4">
					<div>
						<p className="text-primary-foreground/70 text-sm">A receber</p>
						<strong>
							{formatTotals(
								ledger.data?.totalsByCurrency ?? [
									{ currency: "BRL", ...(ledger.data?.totals ?? { iOwe: 0, net: 0, owedToMe: 0 }) },
								],
								"owedToMe",
							)}
						</strong>
					</div>
					<div className="text-right">
						<p className="text-primary-foreground/70 text-sm">A pagar</p>
						<strong>
							{formatTotals(
								ledger.data?.totalsByCurrency ?? [
									{ currency: "BRL", ...(ledger.data?.totals ?? { iOwe: 0, net: 0, owedToMe: 0 }) },
								],
								"iOwe",
							)}
						</strong>
					</div>
				</div>
			</section>
			<div className="mt-5 min-w-0 px-4">
				<PendingNotices debtInvitations />
			</div>
			<section className="grid min-w-0 gap-3 px-4 pt-4">
				{people.length ? (
					people.map(person => (
						<DebtPersonCard
							createPending={createPending}
							key={person.id}
							onCreateEvent={personId => {
								setCreatePersonId(personId);
								setCreateOpen(true);
							}}
							onDeleteEvent={id => deleteEvent.mutate(id)}
							onDeletePerson={id => deletePerson.mutate(id)}
							onEditEvent={(event, personId) => setEditing({ event, personId })}
							onEditPerson={setEditingPerson}
							person={person}
						/>
					))
				) : (
					<div className="rounded-2xl border bg-card py-12 text-center">
						<LuUsersRound className="mx-auto size-10 text-muted-foreground" />
						<p className="mt-3 font-semibold">Nenhuma dívida cadastrada</p>
						<p className="text-muted-foreground text-sm">
							Adicione um lançamento ou vincule uma movimentação.
						</p>
					</div>
				)}
			</section>
			<CreateDebtDialog
				initialDraft={recoveredCreate}
				initialPersonId={createPersonId}
				key={createPersonId ?? "new"}
				mode="create"
				onOpenChange={open => {
					setCreateOpen(open);
					if (!open) setRecoveredCreate(undefined);
				}}
				onSaved={refresh}
				onSubmit={draft => dataService.debts.createOrigin(draft).then(() => undefined)}
				open={createOpen}
				pending={false}
			/>
			{editing ? (
				<CreateDebtDialog
					eventId={editing.event.id}
					initialValue={
						recoveredEdit ?? {
							amount: editing.event.amount,
							currency: editing.event.currency ?? "BRL",
							date: editing.event.date,
							description: editing.event.description ?? undefined,
							dueDate: editing.event.dueDate ?? undefined,
							isOwedToMe: editing.event.effect >= 0,
							personId: editing.personId,
						}
					}
					mode="edit"
					onOpenChange={open => {
						if (!open) {
							setEditing(null);
							setRecoveredEdit(undefined);
						}
					}}
					onSaved={refresh}
					onSubmit={draft => dataService.debts.updateOrigin(editing.event.id, draft).then(() => undefined)}
					open
					pending={!!pending[`${identity}:debt-event:${editing.event.id}`]}
				/>
			) : null}
			{editingPerson ? (
				<EditDebtPersonDialog
					initialDraft={recoveredPerson}
					onOpenChange={open => {
						if (!open) {
							setEditingPerson(null);
							setRecoveredPerson(undefined);
						}
					}}
					onSaved={refresh}
					onSubmit={async draft => {
						const person = editingPerson;
						const accountEmail = draft.accountEmail.trim().toLowerCase();
						const current = (await dataService.debts.getLedger()).people.find(row => row.id === person.id);
						if (current?.name !== draft.name.trim() || (current?.accountEmail ?? "") !== accountEmail)
							await dataService.debts.updatePerson(person.id, {
								accountEmail: accountEmail || null,
								name: draft.name.trim(),
							});
						if (accountEmail && accountEmail !== person.accountEmail)
							await dataService.debts.invitePerson(person.id, accountEmail);
					}}
					open
					pending={false}
					person={editingPerson}
				/>
			) : null}
		</main>
	);
}
