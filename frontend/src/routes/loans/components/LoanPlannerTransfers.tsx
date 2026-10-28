import type { PlannerAccount, PlannerTransfer } from "@zaimu/finance/loan-planner";
import { useState } from "react";
import { LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { showToast } from "@/stores";
export function LoanPlannerTransfers({
	accounts,
	names,
	value,
	onChange,
	from,
}: {
	accounts: PlannerAccount[];
	names: Record<string, string>;
	value: PlannerTransfer[];
	onChange: (rows: PlannerTransfer[]) => void;
	from: string;
}) {
	const [source, setSource] = useState("");
	const [target, setTarget] = useState("");
	const [date, setDate] = useState(from);
	const [amount, setAmount] = useState("");
	const [destination, setDestination] = useState("");
	const origin = accounts.find(row => row.id === source);
	const dest = accounts.find(row => row.id === target);
	const options = accounts.map(row => ({ label: names[row.id] ?? row.id, value: row.id }));
	return (
		<div className="space-y-3">
			{value.map((row, index) => (
				<div
					className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
					key={index}
				>
					<span>
						{row.date}: {names[row.fromAccountId]} → {names[row.toAccountId]}
					</span>
					<Button
						onClick={() => {
							onChange(value.filter((_, i) => i !== index));
							showToast("Resgate removido do cenário", "info");
						}}
						variant="outline"
					>
						<LuTrash2 />
						Remover
					</Button>
				</div>
			))}
			<FormFieldRow>
				<CustomSelect
					label="Conta de origem do resgate"
					onValueChange={setSource}
					options={options}
					placeholder="Ex: Poupança"
					searchable
					value={source}
				/>
				<CustomSelect
					label="Conta de destino"
					onValueChange={setTarget}
					options={options}
					placeholder="Ex: Conta corrente"
					searchable
					value={target}
				/>
				<DateField
					id="transfer-date"
					label="Data de liquidação"
					name="transfer-date"
					onValueChange={setDate}
					value={date}
				/>
			</FormFieldRow>
			<FormFieldRow>
				<MoneyField
					currencyCode={origin?.currency ?? "BRL"}
					id="transfer-amount"
					label="Valor do resgate"
					onValueChange={setAmount}
					value={amount}
				/>
				{origin && dest && origin.currency !== dest.currency && (
					<MoneyField
						currencyCode={dest.currency ?? "BRL"}
						id="transfer-destination"
						label="Crédito na moeda de destino"
						onValueChange={setDestination}
						value={destination}
					/>
				)}
			</FormFieldRow>
			<Button
				disabled={!source || !target || source === target || !(Number(amount) > 0)}
				onClick={() => {
					onChange([
						...value,
						{
							amount: Number(amount),
							date,
							destinationAmount:
								origin?.currency !== dest?.currency ? Number(destination) : undefined,
							fromAccountId: source,
							toAccountId: target,
						},
					]);
					setAmount("");
					showToast("Resgate incluído na simulação", "info");
				}}
				variant="outline"
			>
				<LuPlus />
				Incluir resgate ou transferência
			</Button>
		</div>
	);
}
