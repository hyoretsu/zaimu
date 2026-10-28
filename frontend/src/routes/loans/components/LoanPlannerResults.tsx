import type { PlannerInput, PlannerResult } from "@zaimu/finance/loan-planner";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { formatCurrency } from "./loan-format";
import { LoanPlannerChart } from "./LoanPlannerChart";
import { LoanPlannerDailyBalances } from "./LoanPlannerDailyBalances";
import { LoanSection } from "./LoanSection";
export function LoanPlannerResults({
	baseline,
	ranked,
	currency,
	onSelect,
	selectedId,
	accounts,
	names,
}: {
	baseline: PlannerResult;
	ranked: PlannerResult[];
	currency: string;
	onSelect: (result: PlannerResult) => void;
	selectedId: string;
	accounts: PlannerInput["accounts"];
	names: Record<string, string>;
}) {
	const [limit, setLimit] = useState(60);
	const selected = ranked.find(row => row.id === selectedId) ?? ranked[0] ?? baseline;
	const best = ranked.find(row => row.status === "SAFE" && row.advantage > 0);
	return (
		<div className="min-w-0 space-y-4">
			<p className="font-semibold" role="status">
				{best
					? "Melhor cenário encontrado respeita reserva e supera manter dinheiro rendendo."
					: "Nenhuma antecipação segura e mais vantajosa encontrada. Manter cronograma permanece referência."}
			</p>
			<p className="text-muted-foreground text-xs">
				Segurança condicionada à previsão base e às hipóteses exibidas. Busca limitada; não garante
				ótimo global.
			</p>
			<ScrollArea className="max-h-80 rounded-xl border" horizontalScrollbar>
				<div className="min-w-[42rem] p-2">
					<table className="w-full text-sm">
						<thead>
							<tr>
								<th className="p-2 text-left">Cenário</th>
								<th className="p-2 text-right">Vantagem líquida</th>
								<th className="p-2 text-right">Menor saldo</th>
								<th className="p-2">Segurança</th>
							</tr>
						</thead>
						<tbody>
							{ranked.map(row => (
								<tr className={row.id === selected.id ? "bg-muted" : ""} key={row.id}>
									<td className="p-2">
										<Button
											onClick={() => {
												setLimit(60);
												onSelect(row);
											}}
											size="sm"
											variant="outline"
										>
											{row.name}
										</Button>
									</td>
									<td className="p-2 text-right">
										{formatCurrency(row.advantage, currency)}
									</td>
									<td className="p-2 text-right">
										{row.days.length
											? formatCurrency(row.minimumBalance, currency)
											: "Indisponível"}
									</td>
									<td className="p-2">
										{row.status === "SAFE"
											? "Seguro na previsão"
											: row.status === "UNSAFE"
												? "Déficit previsto"
												: "Dados insuficientes"}
									</td>
								</tr>
							))}
						</tbody>
					</table>
				</div>
			</ScrollArea>
			<LoanPlannerChart baseline={baseline} currency={currency} result={selected} />
			<div className="grid gap-2 sm:grid-cols-2">
				<p>Economia contratual: {formatCurrency(selected.discount, currency)}</p>
				<p>Rendimento líquido perdido: {formatCurrency(selected.lostYield, currency)}</p>
				<p>Desembolso antecipado: {formatCurrency(selected.outlay, currency)}</p>
				<p>Custos de resgate: {formatCurrency(selected.costs, currency)}</p>
				<p>Ativos líquidos finais: {formatCurrency(selected.terminalAssets, currency)}</p>
				<p>Dívida restante: {formatCurrency(selected.remainingDebt, currency)}</p>
				<p>Patrimônio líquido final: {formatCurrency(selected.terminalWealth, currency)}</p>
				<p>
					Menor saldo: {formatCurrency(selected.minimumBalance, currency)} em {selected.minimumDate}
				</p>
			</div>
			{selected.firstDeficit && (
				<p className="text-destructive" role="alert">
					Primeiro déficit: {selected.firstDeficit.date}, saldo{" "}
					{formatCurrency(selected.firstDeficit.amount, currency)}
					{selected.firstDeficit.accountId ? " na conta pagadora" : " na reserva consolidada"}.
				</p>
			)}
			{selected.issues.map((issue, index) => (
				<p key={index} role="alert">
					{issue}
				</p>
			))}
			<LoanPlannerDailyBalances accounts={accounts} key={selected.id} names={names} result={selected} />
			<LoanSection
				summary={`${selected.days.length} dias até ${selected.through}`}
				title="Evolução diária"
			>
				<ScrollArea className="h-80 rounded-xl border" horizontalScrollbar>
					<div className="min-w-[30rem] p-2">
						<table className="w-full text-sm">
							<thead>
								<tr>
									<th className="p-2 text-left">Data</th>
									<th className="p-2 text-right">Saldo disponível</th>
									<th className="p-2 text-right">Entradas</th>
									<th className="p-2 text-right">Saídas</th>
								</tr>
							</thead>
							<tbody>
								{selected.days.slice(0, limit).map(row => (
									<tr key={row.date}>
										<td className="p-2">{row.date}</td>
										<td className="p-2 text-right">
											{formatCurrency(row.balance, currency)}
										</td>
										<td className="p-2 text-right">
											{formatCurrency(row.income, currency)}
										</td>
										<td className="p-2 text-right">
											{formatCurrency(row.expenses, currency)}
										</td>
									</tr>
								))}
							</tbody>
						</table>
						{limit < selected.days.length && (
							<Button onClick={() => setLimit(v => v + 60)} variant="outline">
								Carregar mais dias
							</Button>
						)}
					</div>
				</ScrollArea>
			</LoanSection>
		</div>
	);
}
