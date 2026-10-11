import { useState } from "react";
import { LuChevronDown, LuChevronUp } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { HistoryCoverageSeries } from "./types";

const statuses = {
	MISSING: { className: "bg-destructive", label: "Sem cobertura" },
	SAVED: { className: "bg-emerald-500", label: "Dados salvos" },
	VERIFIED_NO_PUBLICATION: { className: "bg-sky-500", label: "Consultado sem publicação" },
};
const dateLabel = (date: string) => date.split("-").reverse().join("/");
export function HistorySeriesCoverage({
	data,
	requestedDays,
}: {
	data: HistoryCoverageSeries;
	requestedDays: number;
}) {
	const [expanded, setExpanded] = useState(false);
	const months = new Map<string, HistoryCoverageSeries["days"]>();
	for (const day of data.days) {
		const month = day.date.slice(0, 7);
		const days = months.get(month) ?? [];
		days.push(day);
		months.set(month, days);
	}
	const coverage = Math.round(((data.savedDays + data.verifiedDays) / requestedDays) * 100);
	return (
		<article className="grid min-w-0 gap-3 rounded-xl border p-4">
			<div className="flex flex-wrap items-start justify-between gap-2">
				<div>
					<h3 className="font-semibold">
						{data.kind === "INTEREST" ? data.series : `Câmbio - base ${data.series}`}
					</h3>
					<p className="text-muted-foreground text-sm">
						{data.totalRecords.toLocaleString("pt-BR")} registros no banco -{" "}
						{data.rangeRecords.toLocaleString("pt-BR")} no período
					</p>
					<p className="text-muted-foreground text-xs">
						Histórico salvo: {data.firstDate ? dateLabel(data.firstDate) : "Sem dados"} -{" "}
						{data.lastDate ? dateLabel(data.lastDate) : "Sem dados"}
					</p>
				</div>
				<strong>{coverage}% coberto</strong>
			</div>
			<p className="text-sm">
				{data.savedDays} dias com dados - {data.verifiedDays} consultados sem publicação - {data.missingDays}{" "}
				sem cobertura
			</p>
			<ScrollArea
				className="min-h-0 w-full"
				horizontalScrollbar
				style={{ height: Math.min(months.size * 28 + 40, 320) }}
			>
				<div className="grid min-w-[24rem] gap-2 pr-4 pb-4">
					<div aria-hidden="true" className="flex items-center gap-3">
						<span className="w-16 shrink-0 text-muted-foreground text-xs">Mês</span>
						<div className="grid flex-1 grid-cols-[repeat(31,minmax(0,1fr))] gap-1 text-center text-[10px] text-muted-foreground">
							{[1, 5, 10, 15, 20, 25, 31].map(day => (
								<span key={day} style={{ gridColumn: day }}>
									{day}
								</span>
							))}
						</div>
					</div>
					{[...months].map(([month, days]) => (
						<div className="flex items-center gap-3" key={month}>
							<span className="w-16 shrink-0 text-muted-foreground text-xs">
								{month.split("-").reverse().join("/")}
							</span>
							<div className="grid flex-1 grid-cols-[repeat(31,minmax(0,1fr))] gap-1">
								{days.map(day => (
									<Tooltip key={day.date}>
										<TooltipTrigger asChild>
											<button
												aria-label={`${dateLabel(day.date)}: ${statuses[day.status].label}`}
												className={`block h-5 min-w-0 cursor-pointer rounded-sm border border-foreground/20 focus-visible:outline-2 ${statuses[day.status].className}`}
												style={{ gridColumn: Number(day.date.slice(8)) }}
												tabIndex={0}
												type="button"
											/>
										</TooltipTrigger>
										<TooltipContent>
											{dateLabel(day.date)} - {statuses[day.status].label}
										</TooltipContent>
									</Tooltip>
								))}
							</div>
						</div>
					))}
				</div>
			</ScrollArea>
			<div className="rounded-lg border p-3">
				<div className="flex flex-wrap items-center justify-between gap-2">
					<p className="text-sm">Lacunas: {data.missingRanges.length} intervalos</p>
					<ActionGroup>
						<Button
							aria-expanded={expanded}
							onClick={() => setExpanded(value => !value)}
							size="sm"
							variant="outline"
						>
							{expanded ? <LuChevronUp /> : <LuChevronDown />}
							{expanded ? "Minimizar" : "Expandir"}
						</Button>
					</ActionGroup>
				</div>
				{expanded && (
					<ScrollArea className="mt-2 h-40 min-h-0">
						<ul className="grid gap-1 pr-4 text-sm">
							{data.missingRanges.length ? (
								data.missingRanges.map(range => (
									<li key={range.startDate}>
										{dateLabel(range.startDate)} - {dateLabel(range.endDate)}
									</li>
								))
							) : (
								<li>Período totalmente coberto.</li>
							)}
						</ul>
					</ScrollArea>
				)}
			</div>
		</article>
	);
}
