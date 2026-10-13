import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { Loan } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { LoanCard, LoanCreateDialog, LoanPaymentsDialog } from "@/routes/loans/components";
import type { LoanPaymentRecovery } from "./LoanPaymentsDialog";
export function EmpréstimosPage() {
	const identity = useCacheIdentity();
	const [createOpen, setCreateOpen] = useState(false);
	const [recoveredCreate, setRecoveredCreate] = useState<Parameters<typeof dataService.loans.create>[0]>();
	const createPending = useModalRecoveryStore(state => !!state.pending[`${identity}:loan-create`]);
	useBackgroundModalRecovery<Parameters<typeof dataService.loans.create>[0]>("loan-create", entry => {
		setRecoveredCreate(entry.payload);
		setCreateOpen(true);
	});
	const [selected, setSelected] = useState<Loan | null>(null);
	const [recoveredPayment, setRecoveredPayment] = useState<LoanPaymentRecovery>();
	useBackgroundModalRecovery<LoanPaymentRecovery>("loan-payment", entry => {
		setRecoveredPayment(entry.payload);
		setSelected(entry.payload.loan);
	});
	const [recoveredHistory, setRecoveredHistory] = useState<{
		paidDate: string;
		amortization: Loan["amortization"];
	}>();
	useBackgroundModalRecovery<{ loan: Loan; paidDate: string; amortization: Loan["amortization"] }>(
		"loan-history",
		entry => {
			setRecoveredHistory(entry.payload);
			setSelected(entry.payload.loan);
		},
	);
	const [paid, setPaid] = useState(false);
	const loans = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.loans.getAll(),
		queryKey: queryKeys.loans.list(identity!),
	});
	const remaining = (loan: Loan) => loan.remainingInstallments ?? loan.totalInstallments;
	const items =
		loans.data
			?.filter(loan => (paid ? remaining(loan) === 0 : remaining(loan) > 0))
			.toSorted((a, b) => a.lender.localeCompare(b.lender, "pt-BR")) ?? [];
	return (
		<div className="mx-auto w-full max-w-5xl space-y-6 px-4 py-8">
			<PageHeader
				actions={[
					{
						disabled: createPending,
						icon: LuPlus,
						label: "Adicionar empréstimo",
						onClick: () => setCreateOpen(true),
						variant: "default",
					},
				]}
				backTo="/more"
				description="Acompanhe empréstimos, financiamentos e suas parcelas."
				title="Empréstimos"
			/>
			<ActionGroup>
				<Button
					className="cursor-pointer"
					onClick={() => setPaid(false)}
					variant={paid ? "outline" : "default"}
				>
					Ativos
				</Button>
				<Button
					className="cursor-pointer"
					onClick={() => setPaid(true)}
					variant={paid ? "default" : "outline"}
				>
					Quitados
				</Button>
			</ActionGroup>
			<QueryRefreshStatus
				error={loans.isError && loans.data !== undefined}
				onRetry={() => loans.refetch()}
				pending={loans.isFetching && !loans.isPending}
			/>
			{loans.isPending ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton className="h-60" key={i} />
					))}
				</div>
			) : loans.isError && loans.data === undefined ? (
				<div role="alert">
					<p>Falha ao carregar empréstimos.</p>
					<ActionGroup>
						<Button className="mt-2 cursor-pointer" onClick={() => void loans.refetch()} variant="outline">
							Tentar novamente
						</Button>
					</ActionGroup>
				</div>
			) : (
				<>
					<p className="text-muted-foreground">
						Principal restante:{" "}
						<PreferredMoneyAmount
							values={(loans.data ?? []).map(loan => ({
								amount:
									loan.remainingPrincipal ??
									(loan.principalAmount * remaining(loan)) / loan.totalInstallments,
								currency: loan.currency ?? "BRL",
							}))}
						/>
					</p>
					{items.length ? (
						<div className="grid gap-4 sm:grid-cols-2">
							{items.map(loan => (
								<LoanCard isPaid={paid} key={loan.id} loan={loan} onPayments={() => setSelected(loan)} />
							))}
						</div>
					) : (
						<p>{paid ? "Nenhum empréstimo quitado." : "Nenhum empréstimo ativo."}</p>
					)}
				</>
			)}
			{createOpen && (
				<LoanCreateDialog
					initialDraft={recoveredCreate}
					onClose={() => {
						setCreateOpen(false);
						setRecoveredCreate(undefined);
					}}
				/>
			)}
			{selected && (
				<LoanPaymentsDialog
					initialHistory={recoveredHistory}
					loan={loans.data?.find(loan => loan.id === selected.id) ?? selected}
					onClose={() => {
						setSelected(null);
						setRecoveredPayment(undefined);
						setRecoveredHistory(undefined);
					}}
					recovery={recoveredPayment}
				/>
			)}
		</div>
	);
}
