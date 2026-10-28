import {
	activeLoanVersion,
	type LoanSimulationInput,
	outstandingLoanSchedule,
} from "@zaimu/finance/loan-contract";
import type { PlannerInput, PlannerScenario, PlannerTransfer } from "@zaimu/finance/loan-planner";
import { useState } from "react";
import { LuCalculator, LuPlus, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { showToast } from "@/stores";
import { LoanInstallmentRow } from "./LoanInstallmentRow";
import { LoanPlannerTransfers } from "./LoanPlannerTransfers";
import { LoanSection } from "./LoanSection";
export function LoanPlannerManualScenario({
	input,
	names,
	loanNames,
	accountId,
	operations,
	onOperations,
	transfers,
	onTransfers,
	pending,
	onRun,
}: {
	input: PlannerInput;
	names: Record<string, string>;
	loanNames: Record<string, string>;
	accountId: string;
	operations: PlannerScenario["operations"];
	onOperations: (rows: PlannerScenario["operations"]) => void;
	transfers: PlannerTransfer[];
	onTransfers: (rows: PlannerTransfer[]) => void;
	pending: boolean;
	onRun: (scenario: PlannerScenario) => void;
}) {
	const [loanId, setLoanId] = useState(input.loans[0]?.book.loanId ?? "");
	const [date, setDate] = useState(input.from);
	const [mode, setMode] = useState<LoanSimulationInput["mode"]>("BACK");
	const [count, setCount] = useState("1");
	const [amount, setAmount] = useState("");
	const [repetitions, setRepetitions] = useState("1");
	const [every, setEvery] = useState("1");
	const [installmentIds, setInstallmentIds] = useState<string[]>([]);
	const selectedLoan = input.loans.find(row => row.book.loanId === loanId);
	const add = () => {
		onOperations([
			...operations,
			{
				accountId,
				input: {
					amount: Number(amount) > 0 ? Number(amount) : undefined,
					count: Number(count),
					date,
					installmentIds,
					mode,
				},
				loanId,
				repeatEveryMonths: Number(every),
				repetitions: Number(repetitions),
			},
		]);
		showToast("Operação adicionada ao cenário", "info");
	};
	return (
		<LoanSection
			summary={`${operations.length} operações e ${transfers.length} transferências`}
			title="Montar cenário manual"
		>
			<FormFieldRow>
				<CustomSelect
					label="Empréstimo"
					onValueChange={v => {
						setLoanId(v);
						setInstallmentIds([]);
					}}
					options={input.loans
						.filter(row => input.eligibleLoanIds?.includes(row.book.loanId))
						.map(row => ({
							label: loanNames[row.book.loanId] ?? "Empréstimo",
							value: row.book.loanId,
						}))}
					placeholder="Ex: Financiamento"
					searchable
					value={loanId}
				/>
				<CustomSelect
					label="Antecipação"
					onValueChange={v => setMode(v as typeof mode)}
					options={[
						{ label: "Primeiras parcelas", value: "FRONT" },
						{ label: "Últimas parcelas", value: "BACK" },
						{ label: "Parcelas escolhidas", value: "SELECTED" },
						{ label: "Reduzir prazo", value: "REDUCE_TERM" },
						{ label: "Reduzir prestação", value: "REDUCE_PAYMENT" },
						{ label: "Quitar", value: "PAYOFF" },
					]}
					placeholder="Ex: Quitar"
					value={mode}
				/>
				<DateField
					id="planner-operation-date"
					label="Data da antecipação"
					name="planner-operation-date"
					onValueChange={setDate}
					value={date}
				/>
			</FormFieldRow>
			<FormFieldRow>
				<NumericField
					decimalScale={0}
					id="planner-count"
					label="Quantidade de parcelas"
					onValueChange={setCount}
					placeholder="Ex: 6"
					value={count}
				/>
				<MoneyField
					currencyCode={
						selectedLoan ? activeLoanVersion(selectedLoan.book).terms.currency : input.currency
					}
					id="planner-amount"
					label="Amortização extra"
					onValueChange={setAmount}
					value={amount}
				/>
				<NumericField
					decimalScale={0}
					id="planner-repetitions"
					label="Número de repetições"
					onValueChange={setRepetitions}
					placeholder="Ex: 12"
					value={repetitions}
				/>
				<NumericField
					decimalScale={0}
					id="planner-interval"
					label="Intervalo em meses"
					onValueChange={setEvery}
					placeholder="Ex: 1"
					value={every}
				/>
			</FormFieldRow>
			{mode === "SELECTED" &&
				selectedLoan &&
				outstandingLoanSchedule(selectedLoan.book).map(row => (
					<LoanInstallmentRow
						currency={activeLoanVersion(selectedLoan.book).terms.currency}
						key={row.id}
						onSelect={checked =>
							setInstallmentIds(old =>
								checked ? [...old, row.id] : old.filter(id => id !== row.id),
							)
						}
						row={row}
						selected={installmentIds.includes(row.id)}
					/>
				))}
			<ActionGroup>
				<Button disabled={!loanId || !accountId} onClick={add} variant="outline">
					<LuPlus />
					Adicionar operação
				</Button>
			</ActionGroup>
			{operations.map((row, index) => (
				<div className="flex flex-wrap justify-between gap-2 rounded-xl border p-3" key={index}>
					<span>
						{loanNames[row.loanId]} - {row.input.date} -{" "}
						{row.input.mode === "PAYOFF"
							? "Quitação"
							: row.input.mode === "REDUCE_TERM"
								? "Reduzir prazo"
								: row.input.mode === "REDUCE_PAYMENT"
									? "Reduzir prestação"
									: "Antecipar parcelas"}
					</span>
					<Button
						onClick={() => {
							onOperations(operations.filter((_, i) => i !== index));

							showToast("Operação removida do cenário", "info");
						}}
						variant="outline"
					>
						<LuTrash2 />
						Remover
					</Button>
				</div>
			))}
			<LoanPlannerTransfers
				accounts={input.accounts}
				from={input.from}
				names={names}
				onChange={v => {
					onTransfers(v);
				}}
				value={transfers}
			/>
			<ActionGroup>
				<Button
					disabled={pending}
					onClick={() => onRun({ id: "manual", name: "Cenário manual", operations, transfers })}
					variant="outline"
				>
					<LuCalculator />
					Simular cenário manual
				</Button>
			</ActionGroup>
		</LoanSection>
	);
}
