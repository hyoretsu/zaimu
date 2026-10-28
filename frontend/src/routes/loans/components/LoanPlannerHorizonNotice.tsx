import { activeLoanVersion, outstandingLoanSchedule } from "@zaimu/finance/loan-contract";
import { loanPlannerHorizon, type PlannerInput } from "@zaimu/finance/loan-planner";
import { formatCurrency } from "./loan-format";
import { LoanSection } from "./LoanSection";
export function LoanPlannerHorizonNotice({
	input,
	names,
}: {
	input: PlannerInput;
	names: Record<string, string>;
}) {
	const through = loanPlannerHorizon(input);
	const loans = input.loans
		.map(loan => ({
			loan,
			rows: outstandingLoanSchedule(loan.book).filter(row => row.dueDate > through),
		}))
		.filter(row => row.rows.length);
	const later = input.movements
		.filter(row => row.date > through)
		.toSorted((a, b) => a.date.localeCompare(b.date));
	return (
		<LoanSection
			summary={`${loans.length} contratos e ${later.length} movimentos conhecidos após ${through}`}
			title="Compromissos após horizonte"
		>
			<p className="text-muted-foreground text-xs">
				Segurança termina na data exibida. Agendas contínuas podem gerar outros compromissos depois do
				último vencimento carregado. Dívida posterior entra no patrimônio líquido final.
			</p>
			{loans.map(({ loan, rows }) => (
				<p key={loan.book.loanId}>
					{names[loan.book.loanId] ?? "Empréstimo"}: {rows.length} parcelas até{" "}
					{rows.at(-1)!.dueDate}, principal{" "}
					{formatCurrency(
						rows.reduce((sum, row) => sum + row.principal, 0),
						activeLoanVersion(loan.book).terms.currency,
					)}
					.
				</p>
			))}
			{later.slice(0, 8).map((row, index) => (
				<p key={`${row.date}:${index}`}>
					{row.date}:{" "}
					{row.type === "INCOME" ? "Entrada" : row.type === "TRANSFER" ? "Transferência" : "Saída"}{" "}
					de {formatCurrency(row.amount, row.currency ?? input.currency)}.
				</p>
			))}
			{later.length > 8 && <p>Primeiros oito movimentos conhecidos exibidos.</p>}
			{!loans.length && !later.length && <p>Nenhum vencimento posterior no retrato carregado.</p>}
		</LoanSection>
	);
}
