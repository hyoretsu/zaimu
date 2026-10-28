import { HiBanknotes, HiCheckCircle, HiClock } from "react-icons/hi2";
import { LuListChecks } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
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
	const progress = Math.min(100, (paidInstallments / loan.totalInstallments) * 100);
	const terms = loan.contractBook?.versions.at(-1)?.terms;
	const rate = terms
		? [
				terms.rate.indicator ? `${terms.rate.percentage}% ${terms.rate.indicator}` : null,
				terms.rate.fixedRate
					? `${terms.rate.fixedRate}% ${terms.rate.fixedPeriod === "YEARLY" ? "a.a." : "a.m."}`
					: null,
			]
				.filter(Boolean)
				.join(" + ") || "Sem juros"
		: `${loan.interestRate * 100}% p.m.`;

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
						<p className="text-foreground truncate font-semibold">{loan.lender}</p>
						<p className="text-foreground-muted text-xs">{loan.description || rate}</p>
					</div>
				</div>
				{onPayments && (
					<button
						aria-label="Ver parcelas e pagamentos"
						className="border-primary-200 bg-primary-100 text-primary-600 hover:bg-primary-200 cursor-pointer rounded-xl border p-2.5 transition-colors"
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
						{paidInstallments} de {loan.totalInstallments} concluídas
					</span>
					<span className="text-foreground font-medium">{Math.round(progress)}%</span>
				</div>
				<div className="bg-primary-100 h-2 overflow-hidden rounded-full">
					<div
						className={`h-full rounded-full transition-all duration-500 ${
							isPaid ? "bg-success-500" : "from-accent-400 to-accent-300 bg-gradient-to-r"
						}`}
						style={{ width: `${progress}%` }}
					/>
				</div>
			</div>

			{/* Details */}
			<div className="border-primary-50 grid grid-cols-2 gap-3 border-t pt-2">
				<div className="min-w-0">
					<p className="text-foreground-muted mb-1 text-xs">Parcela</p>
					<p className="text-foreground truncate font-bold">
						{formatCurrency(loan.installmentAmount, loan.currency)}
					</p>
				</div>
				<div className="min-w-0 text-right">
					<p className="text-foreground-muted mb-1 text-xs">{isPaid ? "Total pago" : "Restante"}</p>
					<div className={`truncate font-bold ${isPaid ? "text-success-600" : "text-danger-600"}`}>
						<PreferredMoneyAmount
							values={[
								{
									amount: isPaid
										? loan.totalPaid || loan.totalInstallments * loan.installmentAmount
										: (loan.remainingTotal ??
											remainingInstallments * loan.installmentAmount),
									currency: loan.currency ?? "BRL",
								},
							]}
						/>
					</div>
				</div>
			</div>

			{/* Dia do vencimento */}
			{!isPaid && (
				<div className="text-foreground-muted flex items-center gap-2">
					<HiClock className="h-4 w-4" />
					<span className="text-sm">Vencimento dia {loan.dueDay}</span>
				</div>
			)}
		</div>
	);
}
