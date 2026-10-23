import { CustomSelect } from "@/components/ui/CustomSelect";
import { statementLabel } from "@/lib/statement-label";

export function RefundInstallmentOptions({
	installments,
	selected,
	direction,
	onDirectionChange,
	credit,
}: {
	installments: { number: number; statementDate: string; dueDate?: string; statementId?: string }[];
	selected: number[];
	direction: "FIRST" | "LAST";
	onDirectionChange: (direction: "FIRST" | "LAST") => void;
	credit: string;
}) {
	const months = [
		...new Set(
			installments
				.filter(installment => selected.includes(installment.number))
				.map(installment =>
					statementLabel(
						{
							dueDate: installment.dueDate ?? installment.statementDate,
							id: installment.statementId ?? String(installment.number),
						},
						installments.map(item => ({
							dueDate: item.dueDate ?? item.statementDate,
							id: item.statementId ?? String(item.number),
						})),
					),
				),
		),
	];
	const affected = new Intl.ListFormat("pt-BR", { style: "long", type: "conjunction" }).formatToParts(months);
	return (
		<div className="min-w-0 space-y-3">
			<CustomSelect
				label="Começar cancelamento pelas"
				onValueChange={value => onDirectionChange(value as "FIRST" | "LAST")}
				options={[
					{ label: "Últimas parcelas", value: "LAST" },
					{ label: "Primeiras parcelas", value: "FIRST" },
				]}
				placeholder="Selecione a ordem"
				sortOptions={false}
				value={direction}
			/>
			<div className="space-y-1 text-muted-foreground text-sm">
				<p>
					Parcelas afetadas:{" "}
					{affected.length
						? affected.map(part =>
								part.type === "element" ? (
									<strong key={months.indexOf(part.value)}>{part.value}</strong>
								) : (
									part.value
								),
							)
						: "Nenhuma"}
				</p>
				<p>Crédito excedente: {credit}</p>
			</div>
		</div>
	);
}
