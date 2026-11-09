import { LuShoppingCart, LuUsersRound, LuWalletCards } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import type { DebtInvitationPreview as InvitationPreview } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";
import { createCurrencyFormatter } from "@/lib/format-currency";
import { getDebtEventLabel } from "@/routes/debts/components/debt-event";

const formatMoney = (amount: number, currency: string) => createCurrencyFormatter(currency).format(amount);

export function DebtInvitationPreview({
	counterpartyName,
	preview,
	hasMore,
	loadingMore,
	loadMore,
	loadMoreError,
}: {
	counterpartyName: string;
	preview: InvitationPreview;
	hasMore: boolean;
	loadingMore: boolean;
	loadMore: () => void;
	loadMoreError: boolean;
}) {
	return (
		<>
			<div className="bg-muted/30 grid shrink-0 grid-cols-[minmax(0,1fr)_auto] items-center gap-3 rounded-2xl border p-4">
				<div className="flex items-center gap-3">
					<div className="bg-primary/10 text-primary flex size-10 shrink-0 items-center justify-center rounded-2xl">
						<LuUsersRound className="size-5" />
					</div>
					<div className="min-w-0">
						<p className="text-sm font-medium">Saldo atual de {counterpartyName}</p>
						<p className="text-muted-foreground text-xs">
							{preview.eventCount} {preview.eventCount === 1 ? "lançamento" : "lançamentos"}
						</p>
						{hasMore ? (
							<Button
								className="w-full"
								disabled={loadingMore}
								onClick={loadMore}
								variant="outline"
							>
								{loadingMore
									? "Carregando..."
									: loadMoreError
										? "Tentar novamente"
										: "Carregar mais"}
							</Button>
						) : null}
					</div>
				</div>
				<strong
					className={
						preview.balance >= 0
							? "shrink-0 text-right text-sm text-emerald-600 sm:text-base"
							: "shrink-0 text-right text-sm text-rose-600 sm:text-base"
					}
				>
					{(preview.balances ?? [{ amount: preview.balance, currency: "BRL" }])
						.map(row => formatMoney(row.amount, row.currency))
						.join(" / ") || "Sem lançamentos"}
				</strong>
			</div>
			<div className="w-full min-w-0">
				<div className="space-y-4">
					<div className="space-y-2">
						{preview.items.map(event => (
							<div
								className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border p-3"
								key={event.id}
							>
								<div className="text-muted-foreground">
									{event.kind === "PURCHASE" ? <LuShoppingCart /> : <LuWalletCards />}
								</div>
								<div className="min-w-0 flex-1">
									<p className="truncate text-sm font-medium">{getDebtEventLabel(event)}</p>
									<p className="text-muted-foreground truncate text-xs">
										{event.date ? formatLocalDate(event.date) : "Sem data"}
										{formatLocalTime(event.time)
											? ` · ${formatLocalTime(event.time)}`
											: ""}
									</p>
								</div>
								<span
									className={
										event.effect >= 0
											? "shrink-0 text-right text-sm text-emerald-600 sm:text-base"
											: "shrink-0 text-right text-sm text-rose-600 sm:text-base"
									}
								>
									{event.effect === 0 ? "" : event.effect > 0 ? "+" : "-"}
									{formatMoney(Math.abs(event.effect), event.currency ?? "BRL")}
								</span>
							</div>
						))}
						{!preview.items.length ? (
							<p className="text-muted-foreground rounded-xl border border-dashed p-4 text-sm">
								Nenhum lançamento será associado.
							</p>
						) : null}
						{hasMore ? (
							<Button
								className="w-full"
								disabled={loadingMore}
								onClick={loadMore}
								variant="outline"
							>
								{loadingMore
									? "Carregando..."
									: loadMoreError
										? "Tentar novamente"
										: "Carregar mais"}
							</Button>
						) : null}
					</div>
				</div>
			</div>
		</>
	);
}
