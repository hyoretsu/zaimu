import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { LuCheck, LuFastForward } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Loan, LoanPaymentPage } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { LoanPaymentRow } from "./LoanPaymentRow";
import { LoanPayoffPreview } from "./LoanPayoffPreview";

export function LoanPaymentsDialog({ loan, onClose }: { loan: Loan; onClose: () => void }) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [paidDate, setPaidDate] = useState(getLocalDateKey);
	const [advanceType, setAdvanceType] = useState<"FRONT" | "BACK">("FRONT");
	const [amortization, setAmortization] = useState<Loan["amortization"]>(
		loan.amortization === "SAC" ? "SAC" : "PRICE",
	);
	const [pending, setPending] = useState<number[]>([]);
	const [batchPending, setBatchPending] = useState(false);
	const scopes = useRef(new Set<number>());
	const batch = useRef(false);
	const payments = useInfiniteQuery<
		LoanPaymentPage,
		Error,
		import("@tanstack/react-query").InfiniteData<LoanPaymentPage>,
		readonly unknown[],
		string | undefined
	>({
		enabled: identity !== null,
		getNextPageParam: page => page.nextCursor ?? undefined,
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.loans.getPaymentPage(loan.id, { cursor: pageParam, limit: 25 }),
		queryKey: [...queryKeys.loans.all(identity!), "payments", loan.id],
	});
	const run = async (number?: number) => {
		if (
			batch.current ||
			(number === undefined && scopes.current.size) ||
			(number !== undefined && scopes.current.has(number))
		)
			return;
		if (number === undefined) {
			batch.current = true;
			setBatchPending(true);
		} else {
			scopes.current.add(number);
			setPending([...scopes.current]);
		}
		try {
			if (loan.needsPaymentReview)
				await dataService.loans.reviewLegacyPayments(loan.id, paidDate, amortization);
			else if (number !== undefined) await dataService.loans.pay(loan.id, number, paidDate);
			else await dataService.loans.advance(loan.id, 1, advanceType, paidDate);
			await invalidateCacheOperation(client, identity!, "loan");
			showToast(loan.needsPaymentReview ? "Histórico revisado" : "Pagamento registrado", "positive");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Falha ao registrar pagamento", "negative");
		} finally {
			if (number === undefined) {
				batch.current = false;
				setBatchPending(false);
			} else {
				scopes.current.delete(number);
				setPending([...scopes.current]);
			}
		}
	};
	const rows = payments.data?.pages.flatMap(page => page.items) ?? [];
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Parcelas - {loan.lender}</DialogTitle>
					<DialogDescription>
						Registre pagamentos ou antecipe uma parcela pelo valor previsto no cronograma.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-4 pr-3">
						<DateField
							id="loan-paid-date"
							label="Data do pagamento"
							name="paidDate"
							onValueChange={setPaidDate}
							required
							value={paidDate}
						/>
						{loan.needsPaymentReview ? (
							<div className="space-y-3 rounded-xl border p-3">
								<p>
									Histórico antigo sem datas de pagamento. Ao confirmar, as primeiras{" "}
									{loan.paidInstallments ?? 0} parcelas serão marcadas como pagas na data escolhida. Totais
									serão recalculados pelo cronograma selecionado.
								</p>
								<CustomSelect
									label="Amortização confirmada"
									onValueChange={value => setAmortization(value as Loan["amortization"])}
									options={[
										{ label: "PRICE (fixa)", value: "PRICE" },
										{ label: "SAC (decrescente)", value: "SAC" },
									]}
									placeholder="Escolha amortização"
									value={amortization}
								/>
								<ActionGroup>
									<Button
										className="cursor-pointer"
										disabled={batchPending || !paidDate}
										onClick={() => void run()}
									>
										<LuCheck />
										{batchPending ? "Revisando..." : "Confirmar histórico"}
									</Button>
								</ActionGroup>
							</div>
						) : (
							(loan.remainingInstallments ?? loan.totalInstallments) > 0 && (
								<div className="space-y-3 rounded-xl border p-3">
									<CustomSelect
										label="Antecipar parcela"
										onValueChange={value => setAdvanceType(value as "FRONT" | "BACK")}
										options={[
											{ label: "Primeira pendente", value: "FRONT" },
											{ label: "Última pendente", value: "BACK" },
										]}
										placeholder="Escolha ordem"
										value={advanceType}
									/>
									<p className="text-muted-foreground text-xs">
										Registra valor integral da parcela. Desconto de juros exige condições específicas do
										credor.
									</p>
									<ActionGroup>
										<Button
											className="cursor-pointer"
											disabled={batchPending || pending.length > 0 || !paidDate}
											onClick={() => void run()}
										>
											<LuFastForward />
											{batchPending ? "Antecipando..." : "Antecipar uma parcela"}
										</Button>
									</ActionGroup>
								</div>
							)
						)}
						{!loan.needsPaymentReview && <LoanPayoffPreview loanId={loan.id} />}
						{payments.isPending ? (
							Array.from({ length: 4 }, (_, i) => <Skeleton className="h-20 w-full" key={i} />)
						) : payments.isError ? (
							<div role="alert">
								<p>Falha ao carregar parcelas.</p>
								<ActionGroup>
									<Button
										className="mt-2 cursor-pointer"
										onClick={() => void payments.refetch()}
										variant="outline"
									>
										Tentar novamente
									</Button>
								</ActionGroup>
							</div>
						) : rows.length ? (
							<div className="space-y-2">
								{rows.map(row => (
									<LoanPaymentRow
										disabled={
											!!loan.needsPaymentReview ||
											batchPending ||
											pending.includes(row.installmentNumber) ||
											!paidDate
										}
										key={row.id}
										onPay={() => void run(row.installmentNumber)}
										payment={row}
										pending={pending.includes(row.installmentNumber)}
									/>
								))}
							</div>
						) : (
							<p>Nenhuma parcela disponível.</p>
						)}
						{payments.hasNextPage && (
							<Button
								className="w-full cursor-pointer"
								disabled={payments.isFetchingNextPage}
								onClick={() => void payments.fetchNextPage()}
								variant="outline"
							>
								{payments.isFetchingNextPage ? "Carregando..." : "Carregar mais parcelas"}
							</Button>
						)}
					</div>
				</ScrollArea>
				<ActionGroup>
					<Button className="cursor-pointer" onClick={onClose} variant="outline">
						Fechar
					</Button>
				</ActionGroup>
			</DialogContent>
		</Dialog>
	);
}
