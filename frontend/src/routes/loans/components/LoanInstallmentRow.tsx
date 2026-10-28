import type { ContractInstallment } from "@zaimu/finance/loan-contract";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { formatLocalDate } from "@/lib/date";
import { formatCurrency } from "./loan-format";
export function LoanInstallmentRow({
	row,
	currency,
	selected,
	onSelect,
}: {
	row: ContractInstallment;
	currency: string;
	selected?: boolean;
	onSelect?: (checked: boolean) => void;
}) {
	return (
		<div className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-2 rounded-xl border p-3">
			<div>
				{onSelect ? (
					<CheckboxField
						checkboxProps={{ checked: selected, onCheckedChange: c => onSelect(c === true) }}
					>
						Parcela {row.number} - {formatLocalDate(row.dueDate)}
					</CheckboxField>
				) : (
					<p>
						Parcela {row.number} - {formatLocalDate(row.dueDate)}
					</p>
				)}
				<p className="text-muted-foreground text-xs">
					Principal {formatCurrency(row.principal, currency)} | Juros{" "}
					{formatCurrency(row.interest, currency)} | Encargos{" "}
					{formatCurrency(row.charges, currency)}
				</p>
			</div>
			<strong>{formatCurrency(row.principal + row.interest + row.charges, currency)}</strong>
		</div>
	);
}
