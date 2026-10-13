import { useInfiniteQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuCheck, LuFastForward } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { Loan, LoanPayment, LoanPaymentPage } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";

import { LoanPaymentDialog, type LoanPaymentDraft, type LoanPaymentInput } from "./LoanPaymentDialog";
import { LoanPaymentRow } from "./LoanPaymentRow";
import { LoanPayoffPreview } from "./LoanPayoffPreview";

export interface LoanPaymentRecovery {
	draft: LoanPaymentDraft;
	loan: Loan;
	selection: { payment?: LoanPayment; advanceType?: "FRONT" | "BACK" };
}

export function LoanPaymentsDialog({
	loan,
	onClose,
	recovery,
	initialHistory,
}: {
	loan: Loan;
	onClose: () => void;
	recovery?: LoanPaymentRecovery;
	initialHistory?: { paidDate: string; amortization: Loan["amortization"] };
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [paidDate, setPaidDate] = useState(initialHistory?.paidDate ?? getLocalDateKey());
	const [advanceType, setAdvanceType] = useState<"FRONT" | "BACK">("FRONT");
	const [amortization, setAmortization] = useState<Loan["amortization"]>(
		initialHistory?.amortization ?? (loan.amortization === "SAC" ? "SAC" : "PRICE"),
	);

	const [selection, setSelection] = useState<{
		payment?: LoanPayment;
		advanceType?: "FRONT" | "BACK";
	} | null>(recovery?.selection ?? null);
	const pendingActions = useModalRecoveryStore(state => state.pending);
	const batchPending = !!pendingActions[`${identity}:loan:${loan.id}:history`];
	const settlementPending = !!pendingActions[`${identity}:loan:${loan.id}:settlement`];
	const advancePending = ["FRONT", "BACK"].some(
		type => !!pendingActions[`${identity}:loan:${loan.id}:payment:advance:${type}`],
	);
	const pendingFor = (number: number) => !!pendingActions[`${identity}:loan:${loan.id}:payment:${number}`];
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
	const submitPayment = (input: LoanPaymentInput, draft: LoanPaymentDraft) => {
		if (!selection) return;
		const submittedSelection = selection;
		const number = submittedSelection.payment?.installmentNumber;
		runBackgroundModalAction({
			close: () => setSelection(null),
			conflictKey: `loan:${loan.id}:payment:${number ?? `advance:${submittedSelection.advanceType ?? advanceType}`}`,
			conflictKeys: [`loan:${loan.id}:settlement`],
			failureMessage: "Falha ao registrar pagamento.",
			loadingMessage: "Registrando pagamento...",
			onSuccess: () => invalidateCacheOperation(client, identity!, "loan"),
			recovery: {
				entityId: loan.id,
				kind: "loan-payment",
				payload: { draft, loan, selection: submittedSelection },
			},
			run: () =>
				number !== undefined
					? dataService.loans.pay(
							loan.id,
							number,
							input.paidDate,
							input.financialAccountId,
							input.accountAmount,
						)
					: dataService.loans.advance(
							loan.id,
							1,
							submittedSelection.advanceType ?? advanceType,
							input.paidDate,
							input.financialAccountId,
							input.accountAmount,
							input.expectedPaymentId,
						),
			successMessage: "Pagamento registrado.",
		});
	};
	const reviewLegacy = () =>
		runBackgroundModalAction({
			close: onClose,
			conflictKey: `loan:${loan.id}:history`,
			conflictKeys: [`loan:${loan.id}:settlement`],
			failureMessage: "Falha ao revisar histórico.",
			loadingMessage: "Revisando histórico...",
			onSuccess: () => invalidateCacheOperation(client, identity!, "loan"),
			recovery: { entityId: loan.id, kind: "loan-history", payload: { amortization, loan, paidDate } },
			run: () => dataService.loans.reviewLegacyPayments(loan.id, paidDate, amortization),
			successMessage: "Histórico revisado.",
		});

	const rows = payments.data?.pages.flatMap(page => page.items) ?? [];
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
		>
			{selection && (
				<LoanPaymentDialog
					advanceType={selection.advanceType}
					initialDate={paidDate}
					initialDraft={recovery?.draft}
					loanId={loan.id}
					onClose={() => setSelection(null)}
					onSave={submitPayment}
					payment={selection.payment}
				/>
			)}
			<DialogContent className="flex flex-col sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Parcelas - {loan.lender}</DialogTitle>
					<DialogDescription>
						Registre pagamentos ou antecipe uma parcela pelo valor previsto no cronograma.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
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
											disabled={settlementPending || !paidDate}
											onClick={() => void reviewLegacy()}
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
												disabled={settlementPending || advancePending || !paidDate}
												onClick={() => setSelection({ advanceType })}
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
												settlementPending ||
												advancePending ||
												pendingFor(row.installmentNumber) ||
												!paidDate
											}
											key={row.id}
											onPay={() => setSelection({ payment: row })}
											payment={row}
											pending={pendingFor(row.installmentNumber)}
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
					</div>
					<ActionGroup>
						<Button className="cursor-pointer" onClick={onClose} variant="outline">
							Fechar
						</Button>
					</ActionGroup>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
