import type { PlannerInput, PlannerResult } from "@zaimu/finance/loan-planner";
import { useState } from "react";
import { DateField } from "@/components/ui/DateField";
import { formatCurrency } from "./loan-format";
import { LoanSection } from "./LoanSection";
export function LoanPlannerDailyBalances({
	result,
	accounts,
	names,
}: {
	result: PlannerResult;
	accounts: PlannerInput["accounts"];
	names: Record<string, string>;
}) {
	const [date, setDate] = useState(result.minimumDate);
	const day = result.days.find(row => row.date === date);
	return (
		<LoanSection summary={`Consulte qualquer dia até ${result.through}`} title="Saldo diário por conta">
			<DateField
				id="planner-balance-date"
				label="Data para consultar saldos"
				name="planner-balance-date"
				onValueChange={setDate}
				value={date}
			/>
			{day ? (
				<div className="grid gap-2 sm:grid-cols-2">
					{accounts.map(account => (
						<div className="rounded-xl border p-3" key={account.id}>
							<p>{names[account.id] ?? "Conta"}</p>
							<strong>
								{formatCurrency(day.accounts[account.id] ?? 0, account.currency ?? "BRL")}
							</strong>
						</div>
					))}
				</div>
			) : (
				<p role="status">Escolha data dentro do horizonte exibido.</p>
			)}
		</LoanSection>
	);
}
