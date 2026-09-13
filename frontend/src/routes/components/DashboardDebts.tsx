import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowRight, LuHandshake } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { Dashboard } from "@/lib/api";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const mobilePreviewLimit = 4;
const desktopPreviewLimit = 5;

export function DashboardDebts({ debts }: Pick<Dashboard, "debts">) {
	const [open, setOpen] = useState(false);
	const people = debts.people.toSorted((left, right) => {
		if (left.direction !== right.direction) return left.direction === "OWES" ? -1 : 1;
		return Math.abs(right.balance) - Math.abs(left.balance);
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
					{person.balance >= 0 ? "+" : "−"}
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
							A receber: {currency.format(debts.owedToMe)} · A pagar: {currency.format(debts.iOwe)} · Líquido:{" "}
							{currency.format(debts.net)}
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[min(30rem,calc(100dvh-14rem))] pr-3">
						<div className="space-y-3">{rows(people)}</div>
					</ScrollArea>
					<Button asChild className="cursor-pointer" variant="outline">
						<Link to="/debts">
							Gerenciar dívidas <LuArrowRight />
						</Link>
					</Button>
				</DialogContent>
			</Dialog>
		</>
	);
}
