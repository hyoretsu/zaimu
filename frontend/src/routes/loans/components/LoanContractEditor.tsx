import { useQuery, useQueryClient } from "@tanstack/react-query";
import { shiftMonths } from "@zaimu/finance/financial-indicators";
import {
	activeLoanVersion,
	type LoanContractBook,
	type LoanContractTerms,
	outstandingLoanSchedule,
	validateLoanTerms,
} from "@zaimu/finance/loan-contract";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { loanContractService } from "@/lib/loan-contract-service";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
import { submittedLoanTerms, submittedNumber } from "./loan-contract-form";
import { LoanContractFields } from "./LoanContractFields";
export function LoanContractEditor({
	book,
	onClose,
	restructure,
}: {
	book?: LoanContractBook;
	onClose: () => void;
	restructure?: "RENEGOTIATE" | "PORTABILITY";
}) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const currency = useCurrencyStore(s => s.currency);
	const [draft, setDraft] = useState<LoanContractTerms>(() =>
		book
			? {
					...structuredClone(activeLoanVersion(book).terms),
					charges: activeLoanVersion(book).terms.charges.filter(row => row.recurring),
					firstDueDate: outstandingLoanSchedule(book)[0]?.dueDate ?? getLocalDateKey(),
					graceMonths: 0,
					principalAmount: outstandingLoanSchedule(book).reduce(
						(sum, row) => sum + row.principal,
						0,
					),
					startDate: getLocalDateKey(),
					totalInstallments: Math.max(1, outstandingLoanSchedule(book).length),
				}
			: {
					amortization: "PRICE",
					charges: [],
					currency,
					discount: "PRESENT_VALUE",
					firstDueDate: shiftMonths(getLocalDateKey(), 1),
					graceInterest: "PAY",
					graceMonths: 0,
					lateFinePercent: 0,
					lateMonthlyPercent: 0,
					principalAmount: 0,
					rate: { fixedPeriod: "MONTHLY", fixedRate: 0 },
					startDate: getLocalDateKey(),
					totalInstallments: 12,
				},
	);
	const [institutionId, setInstitutionId] = useState(book?.institutionId ?? "");
	const [effectiveDate, setEffectiveDate] = useState(getLocalDateKey());
	const [disbursementAccountId, setDisbursementAccountId] = useState("");
	const [settlement, setSettlement] = useState("");
	const [pending, setPending] = useState(false);
	const [error, setError] = useState("");
	const institutions = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["identity", identity, "loan-institutions"],
	});
	const transactions = useQuery({
		enabled: !!identity && !book,
		queryFn: () => dataService.transactions.getAll(),
		queryKey: [...queryKeys.loans.all(identity!), "available-disbursements"],
	});
	const accounts = useQuery({
		enabled: !!identity && !book,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open && !pending) onClose();
			}}
			open
		>
			<DialogContent className="flex flex-col sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>
						{restructure === "PORTABILITY"
							? "Portabilidade"
							: restructure
								? "Renegociar empréstimo"
								: book
									? "Editar contrato"
									: "Novo empréstimo"}
					</DialogTitle>
					<DialogDescription>
						Condições contratuais e instituição financeira. Histórico realizado permanece
						preservado.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={async event => {
						event.preventDefault();
						if (pending) return;
						setError("");
						try {
							const terms = submittedLoanTerms(event.currentTarget, draft);
							validateLoanTerms(terms);
							if (!institutionId) throw new Error("Selecione instituição financeira");
							setPending(true);
							if (book && restructure)
								await loanContractService.restructure(book.loanId, {
									expectedRevision: book.revision,
									institutionId,
									kind: restructure,
									settlementAmount: submittedNumber(
										event.currentTarget,
										"loan-settlement",
										Number(settlement),
									),
									terms,
								});
							else if (book)
								await loanContractService.update(book.loanId, {
									effectiveDate,
									expectedRevision: book.revision,
									institutionId,
									terms,
								});
							else
								await loanContractService.create({
									disbursementAccountId:
										disbursementAccountId && !disbursementAccountId.startsWith("link:")
											? disbursementAccountId
											: undefined,
									disbursementTransactionId: disbursementAccountId.startsWith("link:")
										? disbursementAccountId.slice(5)
										: undefined,
									institutionId,
									terms,
								});
							await client.invalidateQueries({ queryKey: queryKeys.loans.all(identity!) });
							await client.invalidateQueries({ queryKey: queryKeys.accounts.all(identity!) });
							showToast("Contrato salvo", "positive");
							onClose();
						} catch (error) {
							setError(error instanceof Error ? error.message : "Falha ao salvar contrato");
						} finally {
							setPending(false);
						}
					}}
				>
					<DialogBody>
						<div className="space-y-4">
							{institutions.isPending ? (
								<Skeleton className="h-20" />
							) : institutions.isError ? (
								<p role="alert">
									Falha ao carregar instituições.{" "}
									<Button
										onClick={() => void institutions.refetch()}
										type="button"
										variant="outline"
									>
										Tentar novamente
									</Button>
								</p>
							) : (
								<CustomSelect
									label="Instituição financeira"
									onValueChange={setInstitutionId}
									options={(institutions.data ?? []).map(row => ({
										label: row.name,
										value: row.id,
									}))}
									placeholder="Ex: Banco do Brasil"
									required
									searchable
									value={institutionId}
								/>
							)}
							{restructure && (
								<MoneyField
									currencyCode={draft.currency}
									id="loan-settlement"
									label="Valor de liquidação confirmado pela instituição"
									onValueChange={setSettlement}
									required
									value={settlement}
								/>
							)}
							<LoanContractFields onChange={setDraft} value={draft} />
							{book ? (
								<DateField
									id="contract-effective"
									label="Vigência da alteração"
									name="contract-effective"
									onValueChange={setEffectiveDate}
									required
									value={effectiveDate}
								/>
							) : accounts.isPending ? (
								<Skeleton className="h-20" />
							) : (
								<CustomSelect
									label="Crédito recebido"
									onValueChange={setDisbursementAccountId}
									options={[
										{ label: "Não criar movimento", special: true, value: "" },
										...(accounts.data ?? [])
											.filter(
												row =>
													["CASH", "CHECKING", "SAVINGS", "INVESTMENT"].includes(
														row.type,
													) && (row.currency ?? "BRL") === draft.currency,
											)
											.map(row => ({
												label: `Criar crédito em ${row.name}`,
												value: row.id,
											})),
										...(transactions.data ?? [])
											.filter(
												row =>
													row.type === "INCOME" &&
													(row.currency ?? "BRL") === draft.currency &&
													row.amount === draft.principalAmount,
											)
											.map(row => ({
												label: `Vincular crédito de ${row.date} - ${row.description ?? "Recebimento"}`,
												value: `link:${row.id}`,
											})),
									]}
									placeholder="Ex: Conta corrente"
									searchable
									value={disbursementAccountId}
								/>
							)}{" "}
							{error && (
								<p className="text-destructive" role="alert">
									{error}
								</p>
							)}
							{pending && <p role="status">Salvando contrato...</p>}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button disabled={pending} onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							disabled={pending || institutions.isPending || institutions.isError}
							type="submit"
						>
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
