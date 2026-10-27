import { Link } from "@tanstack/react-router";
import { LuArrowRight, LuCalendarClock } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useUrlModalSelection } from "@/hooks/use-url-modal-selection";
import type { Dashboard } from "@/lib/api";
import { DashboardForecastItem } from "./DashboardForecastItem";

export function DashboardForecasts({
	forecasts,
	currencyCode = "BRL",
}: Pick<Dashboard, "forecasts"> & { currencyCode?: string }) {
	const [panel, setPanel] = useUrlModalSelection("panel");
	const open = panel === "forecasts";
	const setOpen = (open: boolean) => setPanel(open ? "forecasts" : null);
	return (
		<>
			<Card>
				<CardHeader className="flex flex-wrap items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<LuCalendarClock className="text-primary" /> Previsões e faturas
					</CardTitle>
					<ActionGroup className="ml-auto">
						<Button
							className="cursor-pointer"
							onClick={() => setOpen(true)}
							size="sm"
							variant="outline"
						>
							Ver todas
						</Button>
					</ActionGroup>
				</CardHeader>
				<CardContent className="space-y-3">
					<p className="text-muted-foreground text-xs">
						Entradas e saídas previstas por data. Assinaturas do cartão compõem as faturas.
					</p>
					{forecasts.slice(0, 4).map(forecast => (
						<DashboardForecastItem
							currencyCode={currencyCode}
							forecast={forecast}
							key={forecast.id}
							variant="compact"
						/>
					))}
					{!forecasts.length && (
						<p className="text-muted-foreground text-sm">Nenhum compromisso futuro.</p>
					)}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open} url={{ parameter: "panel", value: "forecasts" }}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Previsões e faturas</DialogTitle>
						<DialogDescription>
							Faturas mostram o saldo restante previsto, incluindo assinaturas e parcelas, com
							pagamentos abatidos. Valores podem mudar até o fechamento.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div>
							<div className="space-y-3 pr-3">
								{!forecasts.length && (
									<p className="text-muted-foreground text-sm">
										Nenhum compromisso futuro.
									</p>
								)}
								{forecasts.map(forecast => (
									<DashboardForecastItem
										currencyCode={currencyCode}
										forecast={forecast}
										key={forecast.id}
										variant="detailed"
									/>
								))}
							</div>
						</div>
					</DialogBody>
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
