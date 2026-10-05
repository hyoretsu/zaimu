import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowRight, LuHandshake } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { Dashboard } from "@/lib/api";
import { compareDebtPersonNames } from "@/lib/debt-split";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const mobilePreviewLimit = 4;
const desktopPreviewLimit = 5;

export function DashboardDebts({ debts }: Pick<Dashboard, "debts">) {
	const [open, setOpen] = useState(false);
	const people = debts.people.toSorted((left, right) => {
		const leftIsPayable = left.balance < 0;
		const rightIsPayable = right.balance < 0;
		if (leftIsPayable !== rightIsPayable) return leftIsPayable ? -1 : 1;
		const balanceOrder = leftIsPayable ? left.balance - right.balance : right.balance - left.balance;
		return balanceOrder || compareDebtPersonNames(left.name, right.name);
	});
	const rows = (items: typeof people, isPreview = false) =>
		items.map((person, index) => (
			<div
				className={
					isPreview && index >= desktopPreviewLimit
						? "hidden"
						: isPreview && index >= mobilePreviewLimit
							? "hidden items-center justify-between gap-6 rounded-xl border p-3 lg:flex"
							: "flex items-center justify-between gap-6 rounded-xl border p-3"
				}
				key={person.id}
			>
				<span className="min-w-0 truncate font-medium">{person.name}</span>
				<strong
					className={`shrink-0 tabular-nums ${person.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}
				>
					{currency.format(Math.abs(person.balance))}
				</strong>
			</div>
		));
	return (
		<>
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<LuHandshake className="text-primary" /> Dívidas
					</CardTitle>
					<Button className="cursor-pointer" onClick={() => setOpen(true)} size="sm" variant="outline">
						Ver todas
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{rows(people, true)}
					{!people.length && <p className="text-muted-foreground text-sm">Nenhuma dívida em aberto.</p>}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Dívidas em aberto</DialogTitle>
						<DialogDescription>
							<span className="block">A receber: {currency.format(debts.owedToMe)}</span>
							<span className="block">A pagar: {currency.format(debts.iOwe)}</span>
							<span className="block">
								Líquido {debts.net < 0 ? "a pagar" : "a receber"}: {currency.format(Math.abs(debts.net))}
							</span>
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[min(30rem,calc(100dvh-14rem))] pr-3">
						<div className="space-y-3">{rows(people)}</div>
					</ScrollArea>
					<ActionGroup>
						<Button asChild className="cursor-pointer" variant="outline">
							<Link to="/debts">
								Gerenciar dívidas <LuArrowRight />
							</Link>
						</Button>
					</ActionGroup>
				</DialogContent>
			</Dialog>
		</>
	);
}
