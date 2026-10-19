import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuList, LuPencil, LuTrash2, LuUsersRound } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { DebtEvent, DebtPerson } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { type DebtEventPage, dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { DebtEventItem } from "./DebtEventItem";
import { compareDebtEventsByDateTimeThenLabel } from "./debt-event";

export function DebtPersonCard({
	onDeleteEvent,
	onDeletePerson,
	onEditEvent,
	onEditPerson,
	person,
}: {
	onDeleteEvent: (id: string) => void;
	onDeletePerson: (id: string) => void;
	onEditEvent: (event: DebtEvent, personId: string) => void;
	onEditPerson: (person: DebtPerson) => void;
	person: DebtPerson;
}) {
	const [expanded, setExpanded] = useState(false);
	const identity = useCacheIdentity();
	const pending = useModalRecoveryStore(state => state.pending);
	const personPending = !!pending[`${identity}:debt-person:${person.id}`];
	const eventsQuery = useInfiniteQuery({
		enabled: expanded && identity !== null,
		getNextPageParam: (page: DebtEventPage) => page.nextCursor ?? undefined,
		initialPageParam: null as null | string,
		queryFn: ({ pageParam }) => dataService.debts.getEventPage(person.id, pageParam),
		queryKey: queryKeys.debts.events(identity!, person.id),
	});
	const events = eventsQuery.data?.pages.flatMap(page => page.items) ?? person.events;
	return (
		<article className="min-w-0 max-w-full overflow-x-clip rounded-2xl border bg-card p-4 shadow-sm">
			<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-start gap-3">
				<div className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
					<LuUsersRound />
				</div>
				<div className="min-w-0 flex-1">
					<div className="flex flex-wrap items-center gap-2">
						<h2 className="truncate font-semibold">{person.name}</h2>
						{person.connectionStatus === "PENDING" ? (
							<AppBadge variant="outline">Convite pendente</AppBadge>
						) : person.isZaimuUser ? (
							<AppBadge variant="secondary">Zaimu</AppBadge>
						) : null}
					</div>
					<p className="text-muted-foreground text-sm">
						{person.balances?.some(row => row.amount !== 0)
							? "Saldos por moeda"
							: person.balance > 0
								? "Deve a você"
								: person.balance < 0
									? "Você deve"
									: "Saldo quitado"}
					</p>
				</div>
				<strong
					className={
						person.balance > 0
							? "whitespace-nowrap text-emerald-600"
							: person.balance < 0
								? "whitespace-nowrap text-rose-600"
								: "whitespace-nowrap text-muted-foreground"
					}
				>
					<PreferredMoneyAmount values={person.balances ?? [{ amount: person.balance, currency: "BRL" }]} />
				</strong>
			</div>
			<div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
				<Button
					className="min-w-0 cursor-pointer"
					onClick={() => setExpanded(true)}
					type="button"
					variant="outline"
				>
					<LuList /> Ver lançamentos
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Editar ${person.name}`}
							className="cursor-pointer"
							disabled={personPending}
							onClick={() => onEditPerson(person)}
							size="icon"
							type="button"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Editar pessoa</TooltipContent>
				</Tooltip>
				<ConfirmActionButton
					aria-label={`Excluir ${person.name}`}
					className="cursor-pointer"
					confirmation={`Excluir ${person.name}?`}
					disabled={personPending || events.some(event => !!pending[`${identity}:debt-event:${event.id}`])}
					onConfirm={() => onDeletePerson(person.id)}
					size="icon"
					variant="destructive"
				>
					<LuTrash2 />
				</ConfirmActionButton>
			</div>
			<Dialog onOpenChange={setExpanded} open={expanded}>
				<DialogContent className="gap-4 sm:max-w-xl">
					<DialogHeader>
						<DialogTitle>Lançamentos · {person.name}</DialogTitle>
						<DialogDescription>Movimentações que compõem o saldo desta pessoa.</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div className="grid gap-2">
							{eventsQuery.isPending ? (
								<div className="grid gap-2">
									{[1, 2, 3].map(item => (
										<Skeleton className="h-24 rounded-xl" key={item} />
									))}
								</div>
							) : eventsQuery.isError && !eventsQuery.data ? (
								<div role="alert">
									<p>Não foi possível carregar os lançamentos.</p>
									<Button onClick={() => eventsQuery.refetch()} variant="outline">
										Tentar novamente
									</Button>
								</div>
							) : (
								events
									.toSorted(compareDebtEventsByDateTimeThenLabel)
									.map(event => (
										<DebtEventItem
											event={event}
											key={event.id}
											onDeleteEvent={onDeleteEvent}
											onEditEvent={onEditEvent}
											personId={person.id}
											personPending={personPending}
										/>
									))
							)}
							{!eventsQuery.isPending && !events.length ? (
								<p className="py-8 text-center text-muted-foreground">Nenhum lançamento cadastrado.</p>
							) : null}
							{eventsQuery.isError && eventsQuery.data ? (
								<div role="alert">
									<p>Não foi possível atualizar os lançamentos.</p>
									<Button
										onClick={() =>
											eventsQuery.isFetchNextPageError ? eventsQuery.fetchNextPage() : eventsQuery.refetch()
										}
										variant="outline"
									>
										Tentar novamente
									</Button>
								</div>
							) : null}
							{eventsQuery.hasNextPage ? (
								<Button
									className="w-full cursor-pointer"
									disabled={eventsQuery.isFetchingNextPage}
									onClick={() => eventsQuery.fetchNextPage()}
									variant="outline"
								>
									{eventsQuery.isFetchingNextPage ? "Carregando..." : "Carregar mais"}
								</Button>
							) : null}
						</div>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</article>
	);
}
