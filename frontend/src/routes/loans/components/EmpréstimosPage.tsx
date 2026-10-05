import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { MobilePageActions } from "@/components/ui/MobilePageActions";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Loan } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { LoanCard, LoanCreateDialog, LoanPaymentsDialog } from "@/routes/loans/components";
import { formatCurrency } from "@/routes/loans/components/loan-format";
export function EmpréstimosPage() {
	const identity = useCacheIdentity();
	const [createOpen, setCreateOpen] = useState(false);
	const [selected, setSelected] = useState<Loan | null>(null);
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
			<MobilePageActions
				actions={[{ icon: LuPlus, label: "Adicionar empréstimo", onClick: () => setCreateOpen(true) }]}
			/>
			<div className="flex items-center justify-between gap-3">
				<h1 className="font-bold text-2xl">Empréstimos</h1>
				<Button className="hidden cursor-pointer lg:flex" onClick={() => setCreateOpen(true)}>
					<LuPlus />
					Adicionar
				</Button>
			</div>
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
			{loans.isPending ? (
				<div className="grid gap-4 sm:grid-cols-2">
					{Array.from({ length: 4 }, (_, i) => (
						<Skeleton className="h-60" key={i} />
					))}
				</div>
			) : loans.isError ? (
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
						{formatCurrency(
							(loans.data ?? []).reduce(
								(sum, loan) =>
									sum +
									(loan.remainingPrincipal ??
										(loan.principalAmount * remaining(loan)) / loan.totalInstallments),
								0,
							),
						)}
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
			{createOpen && <LoanCreateDialog onClose={() => setCreateOpen(false)} />}
			{selected && (
				<LoanPaymentsDialog
					loan={loans.data?.find(loan => loan.id === selected.id) ?? selected}
					onClose={() => setSelected(null)}
				/>
			)}
		</div>
	);
}
