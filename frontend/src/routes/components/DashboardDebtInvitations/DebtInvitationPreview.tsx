import { LuShoppingCart, LuUsersRound, LuWalletCards } from "react-icons/lu";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { DebtInvitationPreview as InvitationPreview } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { getDebtEventLabel } from "../../debts/components/debt-event";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function DebtInvitationPreview({
	counterpartyName,
	preview,
}: {
	counterpartyName: string;
	preview: InvitationPreview;
}) {
	return (
		<>
			<div className="grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border bg-muted/30 p-4">
				<div className="flex items-center gap-3">
					<div className="flex size-10 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
						<LuUsersRound className="size-5" />
					</div>
					<div className="min-w-0">
						<p className="font-medium text-sm">Saldo atual de {counterpartyName}</p>
						<p className="text-muted-foreground text-xs">
							{preview.events.length} {preview.events.length === 1 ? "lançamento" : "lançamentos"}
						</p>
					</div>
				</div>
				<strong
					className={
						preview.balance >= 0
							? "shrink-0 text-right text-emerald-600 text-sm sm:text-base"
							: "shrink-0 text-right text-rose-600 text-sm sm:text-base"
					}
				>
					{preview.balance === 0 ? "" : preview.balance > 0 ? "+" : "-"}
					{currency.format(Math.abs(preview.balance))}
				</strong>
			</div>
			<ScrollArea className="min-h-0 w-full">
				<div className="space-y-4">
					<div className="space-y-2">
						{preview.events.map(event => (
							<div
								className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3"
								key={event.id}
							>
								<div className="text-muted-foreground">
									{event.kind === "PURCHASE" ? <LuShoppingCart /> : <LuWalletCards />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate font-medium text-sm">{getDebtEventLabel(event)}</p>
									<p className="truncate text-muted-foreground text-xs">
										{event.date ? formatLocalDate(event.date) : "Sem data"}
										{formatLocalTime(event.time) ? ` · ${formatLocalTime(event.time)}` : ""}
									</p>
								</div>
								<span
									className={
										event.effect >= 0
											? "shrink-0 text-right text-emerald-600 text-sm sm:text-base"
											: "shrink-0 text-right text-rose-600 text-sm sm:text-base"
									}
								>
									{event.effect === 0 ? "" : event.effect > 0 ? "+" : "-"}
									{currency.format(Math.abs(event.effect))}
								</span>
							</div>
						))}
						{!preview.events.length ? (
							<p className="rounded-xl border border-dashed p-4 text-muted-foreground text-sm">
								Nenhum lançamento será associado.
							</p>
						) : null}
					</div>
				</div>
			</ScrollArea>
		</>
	);
}
