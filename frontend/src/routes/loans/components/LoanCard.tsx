import { HiBanknotes, HiCheckCircle, HiClock } from "react-icons/hi2";
import { LuListChecks } from "react-icons/lu";
import type { Loan } from "@/lib/api";
import { formatCurrency } from "./loan-format";
export function LoanCard({
	loan,
	onPayments,
	isPaid,
}: {
	loan: Loan;
	onPayments?: () => void;
	isPaid?: boolean;
}) {
	const paidInstallments = loan.paidInstallments || 0;
	const remainingInstallments = loan.remainingInstallments ?? loan.totalInstallments;
	const progress = (paidInstallments / loan.totalInstallments) * 100;

	return (
		<div className="card space-y-4 p-4">
			{/* Header */}
			<div className="flex items-center justify-between gap-3">
				<div className="flex min-w-0 flex-1 items-center gap-3">
					<div
						className={`flex h-12 w-12 items-center justify-center rounded-2xl ${
							isPaid ? "bg-success-100 text-success-600" : "bg-accent-100 text-accent-600"
						}`}
					>
						{isPaid ? <HiCheckCircle className="h-6 w-6" /> : <HiBanknotes className="h-6 w-6" />}
					</div>
					<div className="min-w-0 flex-1">
						<p className="truncate font-semibold text-foreground">{loan.lender}</p>
						<p className="text-foreground-muted text-xs">
							{loan.description || `${loan.interestRate * 100}% p.m.`}
						</p>
					</div>
				</div>
				{onPayments && (
					<button
						aria-label="Ver parcelas e pagamentos"
						className="cursor-pointer rounded-xl border border-primary-200 bg-primary-100 p-2.5 text-primary-600 transition-colors hover:bg-primary-200"
						onClick={onPayments}
					>
						<LuListChecks className="h-5 w-5" />
					</button>
				)}
			</div>

			{/* Progress */}
			<div>
				<div className="mb-2 flex justify-between text-sm">
					<span className="text-foreground-muted">
						{paidInstallments} de {loan.totalInstallments} pagas
					</span>
					<span className="font-medium text-foreground">{Math.round(progress)}%</span>
				</div>
				<div className="h-2 overflow-hidden rounded-full bg-primary-100">
					<div
						className={`h-full rounded-full transition-all duration-500 ${
							isPaid ? "bg-success-500" : "bg-gradient-to-r from-accent-400 to-accent-300"
						}`}
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Details */}
			<div className="grid grid-cols-2 gap-3 border-primary-50 border-t pt-2">
				<div className="min-w-0">
					<p className="mb-1 text-foreground-muted text-xs">Parcela</p>
					<p className="truncate font-bold text-foreground">
						{formatCurrency(loan.installmentAmount, loan.currency)}
					</p>
				</div>
				<div className="min-w-0 text-right">
					<p className="mb-1 text-foreground-muted text-xs">{isPaid ? "Total pago" : "Restante"}</p>
					<p className={`truncate font-bold ${isPaid ? "text-success-600" : "text-danger-600"}`}>
						{formatCurrency(
							isPaid
								? loan.totalPaid || loan.totalInstallments * loan.installmentAmount
								: remainingInstallments * loan.installmentAmount,
							loan.currency,
						)}
					</p>
				</div>
			</div>

			{/* Dia do vencimento */}
			{!isPaid && (
				<div className="flex items-center gap-2 text-foreground-muted">
					<HiClock className="h-4 w-4" />
					<span className="text-sm">Vencimento dia {loan.dueDay}</span>
				</div>
			)}
		</div>
	);
}
