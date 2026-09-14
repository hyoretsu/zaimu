import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { HiBanknotes, HiCalculator, HiCheck, HiCheckCircle, HiClock, HiPlus, HiXMark } from "react-icons/hi2";
import { DateField } from "@/components/ui/DateField";
import { api, type Loan } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type AuthState, useAuthStore } from "@/stores";

function formatCurrency(value: number) {
	return new Intl.NumberFormat("pt-BR", {
		currency: "BRL",
		style: "currency",
	}).format(value);
}

const amortizationOptions = [
	{ id: "PRICE", label: "PRICE (fixa)" },
	{ id: "SAC", label: "SAC (decrescente)" },
	{ id: "SACRE", label: "SACRE (mista)" },
];

const tabOptions = [
	{ id: "active", label: "Ativos" },
	{ id: "paid", label: "Quitados" },
] as const;

function LoanCard({
	loan,
	onEarlyPayoff,
	isPaid,
}: {
	loan: Loan;
	onEarlyPayoff?: () => void;
	isPaid?: boolean;
}) {
	const paidInstallments = loan.paidInstallments || 0;
	const remainingInstallments = loan.remainingInstallments || loan.totalInstallments;
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
							{loan.description || `${loan.interestRate}% p.m.`}
						</p>
					</div>
				</div>
				{!isPaid && onEarlyPayoff && (
					<button
						className="rounded-xl bg-primary-100 p-2.5 text-primary-600 transition-colors hover:bg-primary-200"
						onClick={onEarlyPayoff}
					>
						<HiCalculator className="h-5 w-5" />
					</button>
				)}
			</div>

			{/* Progress */}
			<div>
				<div className="mb-2 flex justify-between text-sm">
					<span className="text-foreground-muted">
						{paidInstallments} of {loan.totalInstallments} paid
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
					<p className="truncate font-bold text-foreground">{formatCurrency(loan.installmentAmount)}</p>
				</div>
				<div className="min-w-0 text-right">
					<p className="mb-1 text-foreground-muted text-xs">{isPaid ? "Total pago" : "Restante"}</p>
					<p className={`truncate font-bold ${isPaid ? "text-success-600" : "text-danger-600"}`}>
						{formatCurrency(
							isPaid
								? loan.totalPaid || loan.totalInstallments * loan.installmentAmount
								: remainingInstallments * loan.installmentAmount,
						)}
					</p>
				</div>
			</div>

			{/* Dia do vencimento */}
			{!isPaid && (
				<div className="flex items-center gap-2 text-foreground-muted">
					<HiClock className="h-4 w-4" />
					<span className="text-sm">Due day {loan.dueDay}</span>
				</div>
			)}
		</div>
	);
}

export function EmpréstimosPage() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const user = useAuthStore((s: AuthState) => s.user);
	const [isCreateModalOpen, setIsCreateModalOpen] = useState(false);
	const [isEarlyPayoffModalOpen, setIsEarlyPayoffModalOpen] = useState(false);
	const [selectedLoan, setSelectedLoan] = useState<Loan | null>(null);
	const [earlyPayoffType, setEarlyPayoffType] = useState<"FRONT" | "BACK">("BACK");
	const [activeTab, setActiveTab] = useState<"active" | "paid">("active");
	const [newLoan, setNewLoan] = useState({
		amortization: "PRICE",
		description: "",
		dueDay: "",
		firstDueDate: new Date().toISOString().split("T")[0],
		installmentAmount: "",
		interestRate: "",
		lender: "",
		principalAmount: "",
		startDate: new Date().toISOString().split("T")[0],
		totalInstallments: "",
	});

	const { data: loans, isLoading } = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.loans.getAll(),
		queryKey: queryKeys.loans.list(identity!),
	});

	const { data: earlyPayoff, isLoading: isLoadingPayoff } = useQuery({
		enabled: !!user?.id && !!selectedLoan && isEarlyPayoffModalOpen,
		queryFn: () => api.getEarlyPayoff(selectedLoan!.id, { advanceType: earlyPayoffType }),
		queryKey: queryKeys.loans.earlyPayoff(identity!, selectedLoan?.id ?? null, earlyPayoffType),
	});

	const createMutation = useMutation({
		mutationFn: (data: Parameters<typeof dataService.loans.create>[0]) => dataService.loans.create(data),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "loan");
			setIsCreateModalOpen(false);
			resetForm();
		},
	});

	const resetForm = () => {
		setNewLoan({
			amortization: "PRICE",
			description: "",
			dueDay: "",
			firstDueDate: new Date().toISOString().split("T")[0],
			installmentAmount: "",
			interestRate: "",
			lender: "",
			principalAmount: "",
			startDate: new Date().toISOString().split("T")[0],
			totalInstallments: "",
		});
	};

	const handleCreate = () => {
		createMutation.mutate({
			amortization: newLoan.amortization as Loan["amortization"],
			description: newLoan.description || undefined,
			dueDay: Number.parseInt(newLoan.dueDay, 10),
			firstDueDate: newLoan.firstDueDate,
			installmentAmount: newLoan.installmentAmount
				? Number.parseFloat(newLoan.installmentAmount)
				: Number.parseFloat(newLoan.principalAmount) / Number.parseInt(newLoan.totalInstallments, 10),
			interestRate: Number.parseFloat(newLoan.interestRate),
			lender: newLoan.lender,
			principalAmount: Number.parseFloat(newLoan.principalAmount),
			startDate: newLoan.startDate,
			totalInstallments: Number.parseInt(newLoan.totalInstallments, 10),
		});
	};

	const compareLoansByLender = (left: Loan, right: Loan) =>
		left.lender.localeCompare(right.lender, "pt-BR", { sensitivity: "base" });
	const activeEmpréstimos =
		loans?.filter(l => (l.remainingInstallments || 0) > 0).toSorted(compareLoansByLender) || [];
	const paidEmpréstimos =
		loans?.filter(l => (l.remainingInstallments || 0) === 0).toSorted(compareLoansByLender) || [];

	const totalRemaining =
		activeEmpréstimos.reduce((sum, l) => {
			const remaining = (l.remainingInstallments || 0) * l.installmentAmount;
			return sum + remaining;
		}, 0) || 0;

	const monthlyPayment = activeEmpréstimos.reduce((sum, l) => sum + l.installmentAmount, 0) || 0;

	const displayEmpréstimos = activeTab === "active" ? activeEmpréstimos : paidEmpréstimos;

	if (isLoading) {
		return (
			<div className="mx-auto min-h-screen w-full max-w-5xl bg-background lg:py-10">
				<div className="gradient-primary px-4 pt-12 pb-20">
					<div className="mb-4 h-8 w-32 animate-pulse rounded-lg bg-white/20" />
					<div className="h-10 w-48 animate-pulse rounded-lg bg-white/20" />
				</div>
				<div className="-mt-12 space-y-3 px-4">
					{[1, 2].map(i => (
						<div className="h-40 animate-pulse rounded-2xl bg-background-card" key={i} />
					))}
				</div>
			</div>
		);
	}

	return (
		<div className="mx-auto min-h-screen w-full max-w-5xl bg-background lg:py-10">
			{/* Header */}
			<div className="gradient-primary relative overflow-hidden px-4 pt-12 pb-24 lg:rounded-3xl lg:px-8">
				<div className="absolute top-0 right-0 h-48 w-48 translate-x-1/4 -translate-y-1/2 rounded-full bg-primary-500/20" />
				<div className="absolute bottom-0 left-0 h-32 w-32 -translate-x-1/4 translate-y-1/2 rounded-full bg-primary-500/10" />

				<div className="relative z-10">
					<div className="mb-6 flex flex-col items-start gap-3 sm:flex-row sm:items-center sm:justify-between">
						<h1 className="font-bold text-2xl text-white">Empréstimos</h1>
						<button
							className="flex w-full items-center justify-center gap-2 rounded-xl bg-accent-300 px-4 py-2 font-semibold text-primary-900 transition-all hover:bg-accent-200 active:scale-95 sm:w-auto"
							onClick={() => setIsCreateModalOpen(true)}
						>
							<HiPlus className="h-5 w-5" />
							<span>Adicionar</span>
						</button>
					</div>

					{activeEmpréstimos.length > 0 && (
						<div className="grid grid-cols-2 gap-3">
							<div className="min-w-0">
								<p className="mb-1 text-sm text-white/70">Total restante</p>
								<p className="truncate font-bold text-3xl text-white tracking-tight">
									{formatCurrency(totalRemaining)}
								</p>
							</div>
							<div className="min-w-0 text-right">
								<p className="mb-1 text-sm text-white/70">Mensal</p>
								<p className="truncate font-bold text-2xl text-white">{formatCurrency(monthlyPayment)}</p>
							</div>
						</div>
					)}
				</div>
			</div>

			{/* Tabs */}
			<div className="-mt-12 mb-4 px-4">
				<div className="card-glass flex gap-1 rounded-2xl p-2 shadow-card">
					{tabOptions.map(option => {
						const count = option.id === "active" ? activeEmpréstimos.length : paidEmpréstimos.length;
						return (
							<button
								className={`flex-1 rounded-xl px-4 py-2.5 font-medium text-sm transition-all duration-200 ${
									activeTab === option.id
										? "bg-primary-500 text-white shadow-soft"
										: "text-foreground-muted hover:bg-primary-50"
								}`}
								key={option.id}
								onClick={() => setActiveTab(option.id)}
							>
								{option.label} ({count})
							</button>
						);
					})}
				</div>
			</div>

			{/* Loan List */}
			<div className="space-y-4 px-4 pb-8">
				{displayEmpréstimos.length > 0 ? (
					displayEmpréstimos.map((loan, idx) => (
						<div className="animate-fade-in" key={loan.id} style={{ animationDelay: `${idx * 0.1}s` }}>
							<LoanCard
								isPaid={activeTab === "paid"}
								loan={loan}
								onEarlyPayoff={
									activeTab === "active"
										? () => {
												setSelectedLoan(loan);
												setIsEarlyPayoffModalOpen(true);
											}
										: undefined
								}
							/>
						</div>
					))
				) : (
					<div className="card animate-fade-in py-12 text-center">
						<div className="mx-auto mb-4 flex h-16 w-16 items-center justify-center rounded-full bg-primary-50">
							{activeTab === "active" ? (
								<HiCheckCircle className="h-8 w-8 text-success-500" />
							) : (
								<HiBanknotes className="h-8 w-8 text-primary-300" />
							)}
						</div>
						<p className="mb-1 font-semibold text-foreground">
							{activeTab === "active" ? "Nenhum empréstimo ativo" : "Nenhum empréstimo quitado"}
						</p>
						<p className="text-foreground-muted text-sm">
							{activeTab === "active"
								? "Adicione um empréstimo para acompanhar as parcelas."
								: "Empréstimos quitados aparecerão aqui."}
						</p>
					</div>
				)}
			</div>

			{/* Create Loan Modal */}
			{isCreateModalOpen && (
				<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
					<div
						className="absolute inset-0 animate-fade-in bg-primary-900/50 backdrop-blur-sm"
						onClick={() => setIsCreateModalOpen(false)}
					/>

					<div className="scrollbar-themed relative max-h-[90dvh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl">
						<div className="absolute top-3 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-primary-200" />

						<div className="mb-6 flex items-center justify-between pt-2">
							<h2 className="font-bold text-foreground text-xl">Novo empréstimo</h2>
							<button
								className="rounded-full p-2 transition-colors hover:bg-primary-50"
								onClick={() => setIsCreateModalOpen(false)}
							>
								<HiXMark className="h-6 w-6 text-foreground-muted" />
							</button>
						</div>

						<div className="space-y-4">
							<div>
								<span className="mb-2 block font-medium text-foreground-muted text-sm">Credor</span>
								<input
									className="input"
									onChange={e => setNewLoan({ ...newLoan, lender: e.target.value })}
									placeholder="Ex: Banco do Brasil"
									type="text"
									value={newLoan.lender}
								/>
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<div>
									<span className="mb-2 block font-medium text-foreground-muted text-sm">Principal</span>
									<div className="relative">
										<span className="absolute top-1/2 left-4 -translate-y-1/2 font-medium text-foreground-muted">
											R$
										</span>
										<input
											className="input pl-12"
											inputMode="decimal"
											onChange={e => setNewLoan({ ...newLoan, principalAmount: e.target.value })}
											placeholder="10000"
											type="text"
											value={newLoan.principalAmount}
										/>
									</div>
								</div>
								<div>
									<span className="mb-2 block font-medium text-foreground-muted text-sm">Taxa de juros</span>
									<div className="relative">
										<input
											className="input pr-10"
											inputMode="decimal"
											onChange={e => setNewLoan({ ...newLoan, interestRate: e.target.value })}
											placeholder="1.99"
											step="0.01"
											type="text"
											value={newLoan.interestRate}
										/>
										<span className="absolute top-1/2 right-4 -translate-y-1/2 font-medium text-foreground-muted">
											%
										</span>
									</div>
								</div>
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<div>
									<span className="mb-2 block font-medium text-foreground-muted text-sm">Parcelas</span>
									<input
										className="input"
										inputMode="decimal"
										onChange={e => setNewLoan({ ...newLoan, totalInstallments: e.target.value })}
										placeholder="48"
										type="text"
										value={newLoan.totalInstallments}
									/>
								</div>
								<div>
									<span className="mb-2 block font-medium text-foreground-muted text-sm">
										Dia do vencimento
									</span>
									<input
										className="input"
										inputMode="decimal"
										max="31"
										min="1"
										onChange={e => setNewLoan({ ...newLoan, dueDay: e.target.value })}
										placeholder="15"
										type="text"
										value={newLoan.dueDay}
									/>
								</div>
							</div>

							<div>
								<span className="mb-2 block font-medium text-foreground-muted text-sm">Amortização</span>
								<div className="grid gap-2 min-[400px]:grid-cols-3">
									{amortizationOptions.map(option => (
										<button
											className={`rounded-xl px-3 py-2.5 font-medium text-sm transition-all ${
												newLoan.amortization === option.id
													? "bg-primary-500 text-white"
													: "bg-background-card text-foreground hover:bg-primary-100"
											}`}
											key={option.id}
											onClick={() => setNewLoan({ ...newLoan, amortization: option.id })}
										>
											{option.label}
										</button>
									))}
								</div>
							</div>

							<div className="grid gap-3 sm:grid-cols-2">
								<DateField
									id="loan-start-date"
									label="Data inicial"
									name="loan-start-date"
									onValueChange={startDate => setNewLoan({ ...newLoan, startDate })}
									value={newLoan.startDate}
								/>
								<DateField
									id="loan-first-due-date"
									label="Primeiro vencimento"
									name="loan-first-due-date"
									onValueChange={firstDueDate => setNewLoan({ ...newLoan, firstDueDate })}
									value={newLoan.firstDueDate}
								/>
							</div>

							<div>
								<span className="mb-2 block font-medium text-foreground-muted text-sm">
									Description (optional)
								</span>
								<input
									className="input"
									onChange={e => setNewLoan({ ...newLoan, description: e.target.value })}
									placeholder="Ex: Financiamento do carro"
									type="text"
									value={newLoan.description}
								/>
							</div>
						</div>

						<div className="flex gap-3 pt-6">
							<button className="btn-secondary flex-1" onClick={() => setIsCreateModalOpen(false)}>
								Cancel
							</button>
							<button
								className="btn-primary flex flex-1 items-center justify-center gap-2 disabled:cursor-not-allowed disabled:opacity-50"
								disabled={
									!newLoan.lender ||
									!newLoan.principalAmount ||
									!newLoan.interestRate ||
									!newLoan.totalInstallments ||
									createMutation.isPending
								}
								onClick={handleCreate}
							>
								{createMutation.isPending ? (
									<span className="h-5 w-5 animate-spin rounded-full border-2 border-white/30 border-t-white" />
								) : (
									<>
										<HiCheck className="h-5 w-5" />
										<span>Criar</span>
									</>
								)}
							</button>
						</div>
					</div>
				</div>
			)}

			{/* Antecipação Modal */}
			{isEarlyPayoffModalOpen && selectedLoan && (
				<div className="fixed inset-0 z-50 flex items-end justify-center sm:items-center sm:p-6">
					<div
						className="absolute inset-0 animate-fade-in bg-primary-900/50 backdrop-blur-sm"
						onClick={() => {
							setIsEarlyPayoffModalOpen(false);
							setSelectedLoan(null);
						}}
					/>

					<div className="scrollbar-themed relative max-h-[90dvh] w-full max-w-lg animate-slide-up overflow-y-auto rounded-t-3xl bg-white p-6 sm:rounded-3xl">
						<div className="absolute top-3 left-1/2 h-1 w-10 -translate-x-1/2 rounded-full bg-primary-200" />

						<div className="mb-6 flex items-center justify-between pt-2">
							<div className="flex items-center gap-2">
								<HiCalculator className="h-5 w-5 text-primary-500" />
								<h2 className="font-bold text-foreground text-xl">Antecipação</h2>
							</div>
							<button
								className="rounded-full p-2 transition-colors hover:bg-primary-50"
								onClick={() => {
									setIsEarlyPayoffModalOpen(false);
									setSelectedLoan(null);
								}}
							>
								<HiXMark className="h-6 w-6 text-foreground-muted" />
							</button>
						</div>

						{/* Loan Info */}
						<div className="card-glass mb-6 rounded-xl p-4">
							<p className="font-semibold text-foreground">{selectedLoan.lender}</p>
							<p className="text-foreground-muted text-sm">
								{selectedLoan.remainingInstallments} installments remaining
							</p>
						</div>

						{/* Tipo de antecipação */}
						<div className="mb-6">
							<span className="mb-2 block font-medium text-foreground-muted text-sm">
								Tipo de antecipação
							</span>
							<div className="grid grid-cols-2 gap-2">
								<button
									className={`rounded-xl px-4 py-3 font-medium text-sm transition-all ${
										earlyPayoffType === "BACK"
											? "bg-primary-500 text-white"
											: "bg-background-card text-foreground hover:bg-primary-100"
									}`}
									onClick={() => setEarlyPayoffType("BACK")}
								>
									Reduce installments
								</button>
								<button
									className={`rounded-xl px-4 py-3 font-medium text-sm transition-all ${
										earlyPayoffType === "FRONT"
											? "bg-primary-500 text-white"
											: "bg-background-card text-foreground hover:bg-primary-100"
									}`}
									onClick={() => setEarlyPayoffType("FRONT")}
								>
									Reduce amount
								</button>
							</div>
						</div>

						{/* Payoff Info */}
						{isLoadingPayoff ? (
							<div className="space-y-3">
								<div className="h-16 animate-pulse rounded-xl bg-background-card" />
								<div className="h-16 animate-pulse rounded-xl bg-background-card" />
							</div>
						) : earlyPayoff ? (
							<div className="card space-y-4 border border-success-200 bg-success-50 p-4">
								<div className="flex justify-between">
									<span className="text-foreground-muted">Total para quitar hoje</span>
									<span className="font-bold text-success-600">{formatCurrency(earlyPayoff.totalToPay)}</span>
								</div>
								<div className="flex justify-between">
									<span className="text-foreground-muted">Principal restante</span>
									<span className="font-bold text-foreground">
										{formatCurrency(earlyPayoff.remainingPrincipal)}
									</span>
								</div>
								<div className="flex justify-between border-success-200 border-t pt-3">
									<span className="text-foreground-muted">Juros economizados</span>
									<span className="font-bold text-lg text-success-600">
										{formatCurrency(earlyPayoff.savedInterest)}
									</span>
								</div>
							</div>
						) : null}

						<div className="pt-6">
							<button
								className="btn-secondary w-full"
								onClick={() => {
									setIsEarlyPayoffModalOpen(false);
									setSelectedLoan(null);
								}}
							>
								Close
							</button>
						</div>
					</div>
				</div>
			)}
		</div>
	);
}

export const Route = createFileRoute("/loans")({
	component: EmpréstimosPage,
});
