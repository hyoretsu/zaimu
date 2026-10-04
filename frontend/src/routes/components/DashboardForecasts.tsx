import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowRight, LuCalendarClock } from "react-icons/lu";
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
import { DashboardForecastItem } from "./DashboardForecastItem";

export function DashboardForecasts({ forecasts }: Pick<Dashboard, "forecasts">) {
	const [open, setOpen] = useState(false);
	return (
		<>
			<Card>
				<CardHeader className="flex flex-wrap items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<LuCalendarClock className="text-primary" /> Previsões e faturas
					</CardTitle>
					<ActionGroup className="ml-auto">
						<Button className="cursor-pointer" onClick={() => setOpen(true)} size="sm" variant="outline">
							Ver todas
						</Button>
					</ActionGroup>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-muted-foreground text-xs">
						Entradas e saídas previstas por data. Assinaturas do cartão compõem as faturas.
					</p>
					{forecasts.slice(0, 4).map(forecast => (
						<DashboardForecastItem forecast={forecast} key={forecast.id} variant="compact" />
					))}
					{!forecasts.length && <p className="text-muted-foreground text-sm">Nenhum compromisso futuro.</p>}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Previsões e faturas</DialogTitle>
						<DialogDescription>
							Faturas mostram o saldo restante previsto, incluindo assinaturas e parcelas, com pagamentos
							abatidos. Valores podem mudar até o fechamento.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[min(30rem,calc(100dvh-18rem))] min-h-0">
						<div className="space-y-3 pr-3">
							{!forecasts.length && (
								<p className="text-muted-foreground text-sm">Nenhum compromisso futuro.</p>
							)}
							{forecasts.map(forecast => (
								<DashboardForecastItem forecast={forecast} key={forecast.id} variant="detailed" />
							))}
						</div>
					</ScrollArea>
					<DialogFooter>
						<Button asChild variant="outline">
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
