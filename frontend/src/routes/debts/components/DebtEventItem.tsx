import { LuPencil, LuShoppingCart, LuTrash2, LuWalletCards } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import type { DebtEvent } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { useCacheIdentity } from "@/lib/query-cache";
import { getDebtEventCreatorLabel, getDebtEventLabel } from "./debt-event";

export function DebtEventItem({
	event,
	personId,
	personPending,
	onEditEvent,
	onDeleteEvent,
}: {
	event: DebtEvent;
	personId: string;
	personPending: boolean;
	onEditEvent: (event: DebtEvent, personId: string) => void;
	onDeleteEvent: (id: string) => void;
}) {
	const identity = useCacheIdentity();
	const pending = useModalRecoveryStore(state => state.pending);
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-x-3 gap-y-2 rounded-xl border p-3">
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
			<span className={event.effect >= 0 ? "text-emerald-600" : "text-rose-600"}>
				{event.effect === 0 ? "" : event.effect > 0 ? "+" : "-"}
				{new Intl.NumberFormat("pt-BR", {
					currency: event.currency ?? "BRL",
					style: "currency",
				}).format(Math.abs(event.effect))}
			</span>
			{event.kind === "ORIGIN" && event.createdByMe ? (
				<ActionGroup className="col-span-3 border-t pt-2">
					{event.kind === "ORIGIN" && event.createdByMe ? (
						<Button
							aria-label="Editar lançamento"
							className="cursor-pointer"
							disabled={personPending || !!pending[`${identity}:debt-event:${event.id}`]}
							onClick={() => onEditEvent(event, personId)}
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
							disabled={personPending || !!pending[`${identity}:debt-event:${event.id}`]}
							onConfirm={() => onDeleteEvent(event.id)}
							size="icon"
							variant="destructive"
						>
							<LuTrash2 />
						</ConfirmActionButton>
					) : null}
				</ActionGroup>
			) : null}
		</div>
	);
}
