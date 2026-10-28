import { useQuery, useQueryClient } from "@tanstack/react-query";
import {
	activeLoanVersion,
	type LoanSimulationInput,
	outstandingLoanSchedule,
} from "@zaimu/finance/loan-contract";
import { useState } from "react";
import { LuArrowRightLeft, LuPencil, LuUndo2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { loanContractService } from "@/lib/loan-contract-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { formatCurrency } from "./loan-format";
import { LoanContractEditor } from "./LoanContractEditor";
import { LoanInstallmentRow } from "./LoanInstallmentRow";
import { LoanOperationForm } from "./LoanOperationForm";
import { LoanSection } from "./LoanSection";
export function LoanContractDialog({
	loanId,
	onClose,
	initial,
}: {
	loanId: string;
	onClose: () => void;
	initial?: { input: LoanSimulationInput; accountId: string };
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [edit, setEdit] = useState(false);
	const [restructure, setRestructure] = useState<"RENEGOTIATE" | "PORTABILITY" | undefined>();
	const [reversing, setReversing] = useState(false);
	const book = useQuery({
		enabled: !!identity,
		queryFn: () => loanContractService.get(loanId),
		queryKey: [...queryKeys.loans.all(identity!), "contract", loanId],
	});
	const refresh = async () => {
		await client.invalidateQueries({ queryKey: queryKeys.loans.all(identity!) });
		await client.invalidateQueries({ queryKey: queryKeys.accounts.all(identity!) });
		await client.invalidateQueries({ queryKey: ["identity", identity, "dashboard"] });
	};
	const version = book.data ? activeLoanVersion(book.data) : null;
	const rows = book.data ? outstandingLoanSchedule(book.data) : [];
	return (
		<>
			<Dialog
				modal
				onOpenChange={open => {
					if (!open) onClose();
				}}
				open
				url={initial ? undefined : { clear: ["loan"], parameter: "loan", value: loanId }}
			>
				<DialogContent className="flex flex-col sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>Contrato do empréstimo</DialogTitle>
						<DialogDescription>
							Parcelas, pagamentos e simulação de antecipação.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						{book.isPending ? (
							<div className="space-y-4">
								<Skeleton className="h-28" />
								<Skeleton className="h-64" />
							</div>
						) : book.isError ? (
							<div role="alert">
								<p>
									Não foi possível carregar contrato. Revise históricos legados pendentes
									antes de operar.
								</p>
								<Button onClick={() => void book.refetch()} variant="outline">
									Tentar novamente
								</Button>
							</div>
						) : book.data && version ? (
							<div className="space-y-4">
								<ActionGroup>
									<Button onClick={() => setEdit(true)} variant="outline">
										<LuPencil />
										Editar contrato
									</Button>
									{rows.length > 0 && (
										<>
											<Button
												onClick={() => setRestructure("RENEGOTIATE")}
												variant="outline"
											>
												<LuArrowRightLeft />
												Renegociar
											</Button>
											<Button
												onClick={() => setRestructure("PORTABILITY")}
												variant="outline"
											>
												<LuArrowRightLeft />
												Portabilidade
											</Button>
										</>
									)}
								</ActionGroup>
								<p>
									{version.terms.amortization} | {version.terms.totalInstallments} parcelas
									| Revisão {book.data.revision}
								</p>
								{!book.data.institutionId && (
									<p className="text-muted-foreground">
										Credor legado preservado. Associe instituição em Editar contrato.
									</p>
								)}
								<LoanSection
									initiallyOpen
									summary={
										rows.length ? `${rows.length} parcelas pendentes` : "Contrato quitado"
									}
									title="Pagamentos e antecipação"
								>
									<LoanOperationForm
										book={book.data}
										initial={initial}
										key={book.data.revision}
										onChanged={refresh}
									/>
								</LoanSection>
								<LoanSection summary={`${rows.length} parcelas pendentes`} title="Cronograma">
									{rows.map(row => (
										<LoanInstallmentRow
											currency={version.terms.currency}
											key={row.id}
											row={row}
										/>
									))}
								</LoanSection>
								<LoanSection
									summary={`${book.data.receipts.length} registros`}
									title="Histórico de pagamentos"
								>
									{book.data.receipts.map(row => (
										<div
											className="flex flex-wrap items-center justify-between gap-2 rounded-xl border p-3"
											key={row.id}
										>
											<span>
												{row.date} -{" "}
												{row.kind === "REVERSAL"
													? "Estorno"
													: row.kind === "REFINANCE"
														? "Refinanciamento"
														: row.kind === "ADVANCE"
															? "Antecipação"
															: row.kind === "PAYOFF"
																? "Quitação"
																: "Pagamento"}
											</span>
											<strong>
												{formatCurrency(row.amount, version.terms.currency)}
											</strong>
											{book.data!.versions.at(-1)?.receiptId === row.id &&
												!book.data!.receipts.some(
													receipt => receipt.reversesId === row.id,
												) &&
												row.kind !== "REVERSAL" &&
												row.kind !== "REFINANCE" && (
													<Button
														disabled={reversing}
														onClick={async () => {
															setReversing(true);
															try {
																await loanContractService.reverse(
																	loanId,
																	row.id,
																	book.data!.revision,
																);
																await refresh();
																showToast("Pagamento estornado", "positive");
															} catch {
																showToast(
																	"Não foi possível estornar. Atualize contrato antes de tentar novamente.",
																	"negative",
																);
															} finally {
																setReversing(false);
															}
														}}
														variant="outline"
													>
														<LuUndo2 />
														Estornar
													</Button>
												)}
										</div>
									))}
								</LoanSection>
								<LoanSection
									summary={`${book.data.versions.length} versões`}
									title="Versões contratuais"
								>
									{book.data.versions.map(row => (
										<p key={row.revision}>
											Revisão {row.revision} - {row.effectiveDate} -{" "}
											{row.reason === "CREATE"
												? "Cadastro"
												: row.reason === "ADVANCE"
													? "Antecipação"
													: row.reason === "REVERSAL"
														? "Estorno"
														: row.reason === "PORTABILITY"
															? "Portabilidade"
															: row.reason === "RENEGOTIATE"
																? "Renegociação"
																: "Atualização"}
										</p>
									))}
								</LoanSection>
							</div>
						) : null}
					</DialogBody>
					<DialogFooter>
						<Button onClick={onClose} variant="outline">
							Fechar
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{(edit || restructure) && book.data && (
				<LoanContractEditor
					book={book.data}
					onClose={() => {
						setEdit(false);
						setRestructure(undefined);
					}}
					restructure={restructure}
				/>
			)}
		</>
	);
}
