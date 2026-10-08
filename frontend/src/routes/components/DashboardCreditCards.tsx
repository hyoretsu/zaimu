import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowRight, LuCreditCard } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { Dashboard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";

export function DashboardCreditCards({
	creditCards,
	totalAvailableCredit,
	currencyCode = "BRL",
}: Pick<Dashboard, "creditCards" | "totalAvailableCredit"> & { currencyCode?: string }) {
	const currency = new Intl.NumberFormat(navigator.languages, { currency: currencyCode, style: "currency" });
	const [open, setOpen] = useState(false);
	const getName = (card: Dashboard["creditCards"][number]) =>
		getCreditCardDisplayName({ accountName: card.name, institutionName: card.institutionName });
	const ordered = creditCards.toSorted((left, right) => right.availableLimit - left.availableLimit);
	const rows = (items: typeof ordered) =>
		items.map(card => (
			<div className="flex items-start justify-between gap-5 rounded-xl border p-3" key={card.id}>
				<div className="min-w-0">
					<p className="truncate font-medium">{getName(card)}</p>
					<p className="text-muted-foreground text-xs">
						{card.excludeFromTotals ? "Oculto do limite total" : "Incluído no limite total"}
					</p>
				</div>
				<div className="shrink-0 space-y-1 text-right text-xs">
					<p className="text-muted-foreground">Limite disponível</p>
					<p className="font-semibold text-sm tabular-nums">
						{new Intl.NumberFormat(navigator.languages, {
							currency: card.currency ?? "BRL",
							style: "currency",
						}).format(card.availableLimit)}
					</p>
				</div>
			</div>
		));
	return (
		<>
			<Card>
				<CardHeader className="flex flex-wrap items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<LuCreditCard className="text-primary" /> Limites dos cartões
					</CardTitle>
					<ActionGroup className="ml-auto">
						<Button className="cursor-pointer" onClick={() => setOpen(true)} size="sm" variant="outline">
							Ver todos <LuArrowRight />
						</Button>
					</ActionGroup>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="font-semibold text-muted-foreground text-sm">
						Limite disponível:{" "}
						{totalAvailableCredit == null ? "Conversão indisponível" : currency.format(totalAvailableCredit)}
					</p>
					{rows(ordered.slice(0, 4))}
					{!ordered.length && <p className="text-muted-foreground text-sm">Nenhum cartão cadastrado.</p>}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Todos os cartões</DialogTitle>
						<DialogDescription>
							Cartões ocultos continuam visíveis aqui, mas ficam fora do limite consolidado.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[min(30rem,calc(100dvh-14rem))] min-h-0">
						<div className="space-y-3 pr-3">{rows(ordered)}</div>
					</ScrollArea>
					<DialogFooter>
						<Button asChild className="cursor-pointer" variant="outline">
							<Link to="/credit-cards">
								Abrir faturas <LuArrowRight />
							</Link>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
