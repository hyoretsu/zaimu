import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus, LuUsersRound } from "react-icons/lu";
import { PendingNotices } from "@/components/pending-notices";
import { Button } from "@/components/ui/Button";
import { MobilePageActions } from "@/components/ui/MobilePageActions";
import { Skeleton } from "@/components/ui/Skeleton";
import type { DebtEvent, DebtPerson } from "@/lib/api";
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
) =>
	rows
		.map(row =>
			new Intl.NumberFormat("pt-BR", { currency: row.currency, style: "currency" }).format(row[field]),
		)
		.join(" / ");
export function DebtsPage() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [createOpen, setCreateOpen] = useState(false);
	const [editing, setEditing] = useState<{ event: DebtEvent; personId: string } | null>(null);
	const [editingPerson, setEditingPerson] = useState<DebtPerson | null>(null);
	const [pendingEventIds, setPendingEventIds] = useState<Set<string>>(new Set());
	const [pendingPersonIds, setPendingPersonIds] = useState<Set<string>>(new Set());
	const ledger = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getLedger(),
		queryKey: queryKeys.debts.ledger(identity!),
	});
	const refresh = () => invalidateCacheOperation(queryClient, identity!, "debt");
	const create = useMutation({
		mutationFn: (draft: CreateDebtOriginDraft) => dataService.debts.createOrigin(draft),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Lançamento não criado.", "negative"),
		onSuccess: async () => {
			await refresh();
			showToast("Lançamento adicionado ao saldo.", "positive");
		},
	});
	const deletePerson = useMutation({
		mutationFn: (id: string) => dataService.debts.deletePerson(id),
		onSuccess: async () => {
			await refresh();
			showToast("Pessoa excluída.", "info");
		},
	});
	const deleteEvent = useMutation({
		mutationFn: (id: string) => dataService.debts.deleteEvent(id),
		onSuccess: async () => {
			await refresh();
			showToast("Lançamento excluído.", "info");
		},
	});
	const update = useMutation({
		mutationFn: ({ id, draft }: { id: string; draft: UpdateDebtOriginDraft }) =>
			dataService.debts.updateOrigin(id, draft),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Lançamento não atualizado.", "negative"),
		onMutate: ({ id }) => setPendingEventIds(current => new Set(current).add(id)),
		onSettled: (_data, _error, { id }) =>
			setPendingEventIds(current => {
				const next = new Set(current);
				next.delete(id);
				return next;
			}),
		onSuccess: async () => {
			await refresh();
			showToast("Lançamento atualizado.", "positive");
		},
	});
	const updatePerson = useMutation({
		mutationFn: async ({
			accountEmail,
			id,
			name,
			previousAccountEmail,
		}: {
			accountEmail: string;
			id: string;
			name: string;
			previousAccountEmail?: string | null;
		}) => {
			const normalizedEmail = accountEmail.trim().toLowerCase();
			await dataService.debts.updatePerson(id, { accountEmail: normalizedEmail || null, name: name.trim() });
			if (normalizedEmail && normalizedEmail !== previousAccountEmail)
				await dataService.debts.invitePerson(id, normalizedEmail);
		},
		onError: error =>
			showToast(error instanceof Error ? error.message : "Pessoa não atualizada.", "negative"),
		onMutate: ({ id }) => setPendingPersonIds(current => new Set(current).add(id)),
		onSettled: (_data, _error, { id }) =>
			setPendingPersonIds(current => {
				const next = new Set(current);
				next.delete(id);
				return next;
			}),
		onSuccess: async () => {
			await refresh();
			showToast("Pessoa atualizada.", "positive");
		},
	});
	const people = (ledger.data?.people ?? []).toSorted((left, right) =>
		compareDebtPersonNames(left.name, right.name),
	);

	if (ledger.isPending)
		return (
			<div className="mx-auto grid min-h-screen w-full max-w-5xl gap-4 p-4 lg:py-10">
				<Skeleton className="h-56 rounded-3xl" />
				{[1, 2, 3].map(item => (
					<Skeleton className="h-28 rounded-2xl" key={item} />
				))}
			</div>
		);

	return (
		<main className="mx-auto min-h-screen w-full max-w-5xl overflow-x-clip bg-background pt-6 pb-[calc(6rem+env(safe-area-inset-bottom))] lg:py-10">
			<MobilePageActions
				actions={[{ icon: LuPlus, label: "Adicionar lançamento", onClick: () => setCreateOpen(true) }]}
			/>
			<header className="mx-4 min-w-0 rounded-3xl bg-gradient-to-br from-primary to-primary/75 p-5 text-primary-foreground shadow-lg sm:p-6 lg:p-8">
				<div className="flex flex-col gap-4 sm:flex-row sm:items-center sm:justify-between">
					<div>
						<p className="text-primary-foreground/70 text-sm">Saldo líquido</p>
						<h1 className="font-bold text-3xl sm:text-4xl">
							{formatTotals(
								ledger.data?.totalsByCurrency ?? [
									{ currency: "BRL", iOwe: 0, net: 0, owedToMe: 0, ...ledger.data?.totals },
								],
								"net",
							)}
						</h1>
					</div>
					<Button
						className="hidden w-full cursor-pointer lg:inline-flex lg:w-auto"
						onClick={() => setCreateOpen(true)}
						variant="secondary"
					>
						<LuPlus /> Adicionar lançamento
					</Button>
				</div>
				<div className="mt-6 grid grid-cols-2 gap-4 border-primary-foreground/20 border-t pt-4">
					<div>
						<p className="text-primary-foreground/70 text-sm">A receber</p>
						<strong>
							{formatTotals(
								ledger.data?.totalsByCurrency ?? [
									{ currency: "BRL", iOwe: 0, net: 0, owedToMe: 0, ...ledger.data?.totals },
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
									{ currency: "BRL", iOwe: 0, net: 0, owedToMe: 0, ...ledger.data?.totals },
								],
								"iOwe",
							)}
						</strong>
					</div>
				</div>
			</header>
			<div className="mt-5 min-w-0 px-4">
				<PendingNotices debtInvitations />
			</div>
			<section className="grid min-w-0 gap-3 px-4 pt-4">
				{people.length ? (
					people.map(person => (
						<DebtPersonCard
							key={person.id}
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
				mode="create"
				onOpenChange={setCreateOpen}
				onSubmit={draft => create.mutateAsync(draft)}
				open={createOpen}
				pending={false}
			/>
			{editing ? (
				<CreateDebtDialog
					initialValue={{
						amount: editing.event.amount,
						currency: editing.event.currency ?? "BRL",
						date: editing.event.date,
						description: editing.event.description ?? undefined,
						dueDate: editing.event.dueDate ?? undefined,
						isOwedToMe: editing.event.effect >= 0,
						personId: editing.personId,
					}}
					mode="edit"
					onOpenChange={open => {
						if (!open) setEditing(null);
					}}
					onSubmit={draft => update.mutateAsync({ draft, id: editing.event.id })}
					open
					pending={pendingEventIds.has(editing.event.id)}
				/>
			) : null}
			{editingPerson ? (
				<EditDebtPersonDialog
					onOpenChange={open => {
						if (!open) setEditingPerson(null);
					}}
					onSubmit={draft =>
						updatePerson.mutateAsync({
							...draft,
							id: editingPerson.id,
							previousAccountEmail: editingPerson.accountEmail,
						})
					}
					open
					pending={pendingPersonIds.has(editingPerson.id)}
					person={editingPerson}
				/>
			) : null}
		</main>
	);
}
