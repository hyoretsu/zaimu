import { CheckboxField } from "@/components/ui/CheckboxField";
import type { Loan } from "@/lib/api";

export function ExistingLoanPicker({
	loans,
	onChange,
	selected,
}: {
	loans: Loan[];
	onChange: (ids: string[]) => void;
	selected: string[];
}) {
	const active = loans.filter(
		loan => (loan.remainingInstallments ?? loan.totalInstallments) > 0 && loan.contractBook,
	);
	if (active.length === 0) return null;
	return (
		<section className="card space-y-3 p-4">
			<div className="space-y-1">
				<h2 className="font-semibold">Comparar com meus empréstimos</h2>
				<p className="text-muted-foreground text-sm">
					O saldo restante entra como oferta: valor de quitação hoje contra as parcelas que faltam.
					Útil para avaliar portabilidade ou troca de dívida.
				</p>
			</div>
			<div className="grid gap-2 sm:grid-cols-2">
				{active.map(loan => (
					<CheckboxField
						checkboxProps={{
							checked: selected.includes(loan.id),
							onCheckedChange: checked =>
								onChange(
									checked === true
										? [...selected, loan.id]
										: selected.filter(id => id !== loan.id),
								),
						}}
						key={loan.id}
					>
						{loan.description || loan.lender}
					</CheckboxField>
				))}
			</div>
		</section>
	);
}
