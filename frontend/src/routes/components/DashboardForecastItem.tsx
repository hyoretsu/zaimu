import type { Dashboard } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const compactDate = new Intl.DateTimeFormat("pt-BR", { day: "2-digit", month: "short" });

const forecastTypeLabels = {
	CARD: "Fatura do cartão",
	LOAN: "Parcela de empréstimo",
	RECURRING: "Lançamento recorrente",
	SALARY: "Salário",
	SUBSCRIPTION: "Assinatura",
	TRANSACTION: "Movimentação agendada",
} satisfies Record<Dashboard["forecasts"][number]["type"], string>;

export function DashboardForecastItem({
	forecast,
	variant,
}: {
	forecast: Dashboard["forecasts"][number];
	variant: "compact" | "detailed";
}) {
	const occurrence = new Date(`${forecast.date}T12:00:00`);
	const isIncome = forecast.direction === "INCOME";
	const amount = `${isIncome ? "+" : "−"}${currency.format(forecast.amount)}`;
	const amountClassName = isIncome ? "text-emerald-600" : "text-rose-600";
	if (variant === "detailed") {
		return (
			<article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 rounded-xl border bg-card p-3">
				<time
					className="flex min-w-12 flex-col rounded-lg bg-muted px-2 py-1.5 text-center leading-tight"
					dateTime={forecast.date}
				>
					<span className="font-semibold text-lg tabular-nums">{forecast.date.slice(8, 10)}</span>
					<span className="text-muted-foreground text-xs uppercase">
						{new Intl.DateTimeFormat("pt-BR", { month: "short" }).format(occurrence).replace(".", "")}
					</span>
				</time>
				<div className="min-w-0">
					<p className="truncate font-medium">{forecast.name}</p>
					<p className="mt-0.5 text-muted-foreground text-xs">
						{forecastTypeLabels[forecast.type]} ·{" "}
						{formatLocalDate(forecast.date, { day: "2-digit", month: "2-digit", year: "numeric" })}
					</p>
				</div>
				<strong className={`text-right text-sm tabular-nums ${amountClassName}`}>{amount}</strong>
			</article>
		);
	}
	return (
		<article className="flex items-center justify-between gap-5 rounded-xl border p-3">
			<div className="min-w-0">
				<p className="truncate font-medium">{forecast.name}</p>
				<p className="text-muted-foreground text-xs">
					{forecastTypeLabels[forecast.type]} · {compactDate.format(occurrence)}
				</p>
			</div>
			<strong className={`shrink-0 text-right tabular-nums ${amountClassName}`}>{amount}</strong>
		</article>
	);
}
