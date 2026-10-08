import type { ReactNode } from "react";
import { LuCalendarClock, LuPlus, LuReceiptText, LuWalletCards } from "react-icons/lu";
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
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const statement = card.currentStatement;
	const currentBill = Math.max(0, statement?.balanceAmount ?? 0);
	const limit = card.limit;
	const percent =
		limit.effectiveLimit > 0 ? Math.min(100, (limit.usedLimit / limit.effectiveLimit) * 100) : 0;

	return (
		<article className="flex h-full flex-col overflow-hidden rounded-3xl border bg-card shadow-card">
			<div className="relative min-h-44 overflow-hidden bg-brand-indigo p-6 text-white">
				<div className="absolute -top-16 -right-12 size-48 rounded-full bg-brand-yellow/25" />
				<div className="absolute -bottom-20 -left-12 size-44 rounded-full border-[28px] border-white/10" />
				<div className="relative flex items-start justify-between">
					<span className="flex size-11 items-center justify-center rounded-2xl bg-white/15">
						<LuWalletCards className="size-6" />
					</span>
					<span className="rounded-full border border-white/20 px-3 py-1 text-white/75 text-xs">
						fecha dia {card.statementDay}
					</span>
				</div>
				<div className="relative mt-7">
					<h2 className="font-bold text-xl">{getCreditCardDisplayName(card)}</h2>
					<div className="mt-1 flex items-center justify-between gap-2">
						<p className="text-sm text-white/65">vencimento dia {card.dueDay}</p>
						{card.excludeFromTotals && (
							<span className="shrink-0 rounded-full border border-white/25 px-2.5 py-1 text-white/75 text-xs">
								Oculto
							</span>
						)}
					</div>
				</div>
				{managementActions && <div className="relative mt-4 flex justify-end gap-2">{managementActions}</div>}
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
					<div className="rounded-xl bg-muted p-3">
						<p className="text-muted-foreground text-xs">Fatura prevista</p>
						<p className="mt-1 font-bold">{currency.format(currentBill)}</p>
					</div>
					<div className="rounded-xl bg-accent p-3 text-accent-foreground">
						<p className="text-brand-ink/60 text-xs">Disponível</p>
						<p className="mt-1 font-bold">{currency.format(limit.availableLimit)}</p>
					</div>
				</div>
				{limit.temporaryCredit > 0 && (
					<div className="rounded-xl border border-brand-yellow/60 bg-brand-yellow/10 p-3">
						<p className="text-muted-foreground text-xs">Crédito temporário por pagamento excedente</p>
						<p className="mt-1 font-bold">+ {currency.format(limit.temporaryCredit)}</p>
					</div>
				)}
				{card.securityDeposit != null && (
					<div className="rounded-xl border border-dashed p-3">
						<p className="text-muted-foreground text-xs">Valor em garantia do limite</p>
						<p className="mt-1 font-bold">{currency.format(card.securityDeposit)}</p>
					</div>
				)}
				<div className="mt-auto flex flex-col gap-5">
					{statement && (
						<p className="flex items-center gap-2 text-muted-foreground text-sm">
							<LuCalendarClock /> Vence em {formatLocalDate(statement.dueDate)}
						</p>
					)}
					<div className="grid gap-3 min-[420px]:grid-cols-2">
						<Button className="w-full cursor-pointer" onClick={onViewStatements} variant="outline">
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
