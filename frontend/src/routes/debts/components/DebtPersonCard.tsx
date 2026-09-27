import { useInfiniteQuery } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuChevronDown,
	LuChevronUp,
	LuPencil,
	LuShoppingCart,
	LuTrash2,
	LuUsersRound,
	LuWalletCards,
} from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { DebtEvent, DebtPerson } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	compareDebtEventsByDateTimeThenLabel,
	getDebtEventCreatorLabel,
	getDebtEventLabel,
} from "./debt-event";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

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
	const eventsQuery = useInfiniteQuery({
		enabled: expanded && identity !== null,
		getNextPageParam: page => page.nextCursor ?? undefined,
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
						{person.isZaimuUser ? <AppBadge variant="secondary">Zaimu</AppBadge> : null}
						{person.connectionStatus === "PENDING" ? (
							<AppBadge variant="outline">Convite pendente</AppBadge>
						) : null}
					</div>
					<p className="text-muted-foreground text-sm">
						{person.balance > 0 ? "Deve a você" : person.balance < 0 ? "Você deve" : "Saldo quitado"}
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
					{currency.format(Math.abs(person.balance))}
				</strong>
			</div>
			<div className="mt-3 grid min-w-0 grid-cols-[minmax(0,1fr)_auto_auto] gap-2">
				<Button
					className="min-w-0 cursor-pointer"
					onClick={() => setExpanded(current => !current)}
					type="button"
					variant="outline"
				>
					{expanded ? <LuChevronUp /> : <LuChevronDown />} {expanded ? "Minimizar" : "Expandir"}
				</Button>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label={`Editar ${person.name}`}
							className="cursor-pointer"
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
					onConfirm={() => onDeletePerson(person.id)}
					size="icon"
					variant="destructive"
				>
					<LuTrash2 />
				</ConfirmActionButton>
			</div>
			{expanded ? (
				<div className="mt-4 grid gap-2 border-t pt-4">
					{eventsQuery.isPending ? (
						<p className="text-muted-foreground text-sm">Carregando lançamentos...</p>
					) : null}
					{events.toSorted(compareDebtEventsByDateTimeThenLabel).map(event => (
						<div
							className="grid grid-cols-[auto_minmax(0,1fr)] items-center gap-x-3 gap-y-2 rounded-xl border p-3 sm:flex sm:gap-3"
							key={event.id}
						>
							<div className="text-muted-foreground">
								{event.kind === "PURCHASE" ? <LuShoppingCart /> : <LuWalletCards />}
							</div>
							<div className="min-w-0 flex-1">
								<p className="truncate font-medium text-sm">{getDebtEventLabel(event)}</p>
								<p className="text-muted-foreground text-xs">
									{event.date ? formatLocalDate(event.date) : ""}
									{formatLocalTime(event.time) ? ` · ${formatLocalTime(event.time)}` : ""}
									{event.date || event.time ? " · " : ""}
									{getDebtEventCreatorLabel(event)}
								</p>
							</div>
							<div className="col-span-2 flex items-center justify-end gap-2 border-t pt-2 sm:col-auto sm:ml-auto sm:border-0 sm:pt-0">
								<span className={event.effect >= 0 ? "text-emerald-600" : "text-rose-600"}>
									{event.effect === 0 ? "" : event.effect > 0 ? "+" : "−"}
									{currency.format(Math.abs(event.effect))}
								</span>
								{event.kind === "ORIGIN" && event.createdByMe ? (
									<Button
										aria-label="Editar lançamento"
										className="cursor-pointer"
										onClick={() => onEditEvent(event, person.id)}
										size="icon"
										type="button"
										variant="outline"
									>
										<LuPencil />
									</Button>
								) : null}
								{event.kind === "ORIGIN" && event.createdByMe ? (
									<ConfirmActionButton
										aria-label="Excluir lançamento"
										className="cursor-pointer"
										confirmation="Excluir este lançamento?"
										onConfirm={() => onDeleteEvent(event.id)}
										size="icon"
										variant="destructive"
									>
										<LuTrash2 />
									</ConfirmActionButton>
								) : null}
							</div>
						</div>
					))}
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
			) : null}
		</article>
	);
}
