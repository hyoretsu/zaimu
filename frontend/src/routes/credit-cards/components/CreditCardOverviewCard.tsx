import type { ReactNode } from "react";
import { LuCalendarClock, LuPlus, LuReceiptText, LuWalletCards } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { Button } from "@/components/ui/Button";
import { Progress } from "@/components/ui/Progress";
import type { CreditCard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { formatLocalDate } from "@/lib/date";
import { PendingRefundReviews } from "./PendingRefundReviews";

export function CreditCardOverviewCard({
	card,
	onAddPurchase,
	onViewStatements,
	managementActions,
}: {
	card: CreditCard;
	onAddPurchase: () => void;
	onViewStatements: () => void;
	managementActions?: ReactNode;
}) {
	const currencyCode = card.currency ?? "BRL";
	const statement = card.currentStatement;
	const currentBill = Math.max(0, statement?.balanceAmount ?? 0);
	const limit = card.limit;
	const percent =
		limit.effectiveLimit > 0 ? Math.min(100, (limit.usedLimit / limit.effectiveLimit) * 100) : 0;

	return (
		<article className="bg-card shadow-card flex h-full flex-col overflow-hidden rounded-3xl border">
			<div className="bg-brand-indigo relative min-h-44 overflow-hidden p-6 text-white">
				<div className="bg-brand-yellow/25 absolute -top-16 -right-12 size-48 rounded-full" />
				<div className="absolute -bottom-20 -left-12 size-44 rounded-full border-[28px] border-white/10" />
				<div className="relative flex items-start justify-between">
					<span className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
						<LuWalletCards className="size-6" />
					</span>
					<span className="rounded-full border border-white/20 px-3 py-1 text-xs text-white/75">
						fecha dia {card.statementDay}
					</span>
				</div>
				<div className="relative mt-7">
					<h2 className="text-xl font-bold">{getCreditCardDisplayName(card)}</h2>
					<div className="mt-1 flex items-center justify-between gap-2">
						<p className="text-sm text-white/65">vencimento dia {card.dueDay}</p>
					</div>
				</div>
				{managementActions && (
					<div className="relative mt-4 flex justify-end gap-2">{managementActions}</div>
				)}
			</div>
			<div className="flex flex-1 flex-col gap-5 p-5">
				<PendingRefundReviews cardId={card.id} count={card.pendingRefundReviewCount ?? 0} />
				<div>
					<div className="mb-2 flex justify-between gap-3 text-sm">
						<span className="text-muted-foreground">Limite utilizado</span>
						<strong>{percent.toFixed(0)}%</strong>
					</div>
					<Progress value={percent} />
				</div>
				<div className="grid gap-3 min-[420px]:grid-cols-2">
					<div className="bg-muted rounded-xl p-3">
						<p className="text-muted-foreground text-xs">Fatura prevista</p>
						<p className="mt-1 font-bold">
							{
								<PreferredMoneyAmount
									values={[{ amount: currentBill, currency: currencyCode }]}
								/>
							}
						</p>
					</div>
					<div className="bg-accent text-accent-foreground rounded-xl p-3">
						<p className="text-brand-ink/60 text-xs">Disponível</p>
						<p className="mt-1 font-bold">
							{
								<PreferredMoneyAmount
									values={[{ amount: limit.availableLimit, currency: currencyCode }]}
								/>
							}
						</p>
					</div>
				</div>
				{limit.temporaryCredit > 0 && (
					<div className="border-brand-yellow/60 bg-brand-yellow/10 rounded-xl border p-3">
						<p className="text-muted-foreground text-xs">
							Crédito temporário por pagamento excedente
						</p>
						<p className="mt-1 font-bold">
							+{" "}
							{
								<PreferredMoneyAmount
									values={[{ amount: limit.temporaryCredit, currency: currencyCode }]}
								/>
							}
						</p>
					</div>
				)}
				{card.securityDeposit != null && (
					<div className="rounded-xl border border-dashed p-3">
						<p className="text-muted-foreground text-xs">Valor em garantia do limite</p>
						<p className="mt-1 font-bold">
							{
								<PreferredMoneyAmount
									values={[{ amount: card.securityDeposit, currency: currencyCode }]}
								/>
							}
						</p>
					</div>
				)}
				<div className="mt-auto flex flex-col gap-5">
					{statement && (
						<p className="text-muted-foreground flex items-center gap-2 text-sm">
							<LuCalendarClock /> Vence em {formatLocalDate(statement.dueDate)}
						</p>
					)}
					<div className="grid gap-3 min-[420px]:grid-cols-2">
						<Button
							className="w-full cursor-pointer"
							onClick={onViewStatements}
							variant="outline"
						>
							<LuReceiptText /> Ver faturas
						</Button>
						<Button className="w-full cursor-pointer" onClick={onAddPurchase}>
							<LuPlus /> Registrar compra
						</Button>
					</div>
				</div>
			</div>
		</article>
	);
}
