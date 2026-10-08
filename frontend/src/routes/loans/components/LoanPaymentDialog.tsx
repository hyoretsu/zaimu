import { useQuery } from "@tanstack/react-query";
import { roundMoney } from "@zaimu/finance/money";
import { useState } from "react";
import { LuCopy } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { LoanPayment } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { readCurrencyRate } from "@/lib/financial-history";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { formatCurrency } from "./loan-format";

export interface LoanPaymentInput {
	expectedPaymentId?: string;
	paidDate: string;
	financialAccountId?: string;
	accountAmount?: number;
}
export function LoanPaymentDialog({
	loanId,
	payment,
	advanceType,
	initialDate,
	onSave,
	onClose,
}: {
	initialDate?: string;
	loanId: string;
	payment?: LoanPayment;
	advanceType?: "FRONT" | "BACK";
	onSave: (input: LoanPaymentInput) => Promise<boolean>;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const [paidDate, setPaidDate] = useState(() => initialDate ?? getLocalDateKey());
	const [accountId, setAccountId] = useState("");
	const [amount, setAmount] = useState("");
	const [pending, setPending] = useState(false);
	const accounts = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const next = useQuery({
		enabled: !!identity && !payment,
		queryFn: () => dataService.loans.getNextPayment(loanId, advanceType ?? "FRONT"),
		queryKey: [...queryKeys.loans.all(identity!), "next", loanId, advanceType],
	});
	const row = payment ?? next.data;
	const account = accounts.data?.find(row => row.id === accountId);
	const currency = account?.currency ?? "BRL";
	const source = row?.currency ?? "BRL";
	const rate = useQuery({
		enabled: !!identity && !!row && !!account && source !== currency,
		queryFn: () => readCurrencyRate(paidDate, source, currency),
		queryKey: ["identity", identity, "loan-rate", paidDate, source, currency],
	});
	const suggestion =
		row && account && (source === currency || rate.data)
			? roundMoney(row.totalPaid * (source === currency ? 1 : rate.data!.rate), currency)
			: null;
	const loading = accounts.isPending || (!payment && next.isPending);
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open && !pending) onClose();
			}}
			open
		>
			<DialogContent className="flex max-h-[85dvh] flex-col sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{advanceType ? "Antecipar parcela" : "Pagar parcela"}</DialogTitle>
					<DialogDescription>Confirme data, conta e débito efetivo.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<div className="space-y-4 pr-3">
						{loading ? (
							<>
								<Skeleton className="h-16" />
								<Skeleton className="h-40" />
							</>
						) : accounts.isError || (!payment && next.isError) ? (
							<p role="alert">Falha ao carregar pagamento.</p>
						) : !row ? (
							<p>Nenhuma parcela pendente.</p>
						) : (
							<>
								<p>
									Parcela {row.installmentNumber}: {formatCurrency(row.totalPaid, source)}
								</p>
								<DateField
									id="loan-payment-date"
									label="Data do pagamento"
									name="paidDate"
									onValueChange={setPaidDate}
									required
									value={paidDate}
								/>
								<CustomSelect
									label="Conta de pagamento"
									onValueChange={value => {
										setAccountId(value);
										setAmount("");
									}}
									options={[
										{ label: "Sem conta específica", special: true, value: "" },
										...(accounts.data ?? [])
											.filter(account => ["CHECKING", "CASH", "SAVINGS", "INVESTMENT"].includes(account.type))
											.map(account => ({
												label: `${account.name} (${account.currency ?? "BRL"})`,
												value: account.id,
											})),
									]}
									placeholder="Ex: Conta em USD"
									searchable
									value={accountId}
								/>
								{account && (
									<>
										<MoneyField
											currencyCode={currency}
											id="loan-actual-debit"
											label="Débito efetivo (opcional)"
											onValueChange={setAmount}
											value={amount}
										/>
										{source !== currency && rate.isPending ? (
											<Skeleton className="h-8" />
										) : suggestion !== null ? (
											<div className="flex flex-wrap items-center justify-end gap-2">
												<p className="text-muted-foreground text-sm">
													Sugestão diária: {formatCurrency(suggestion, currency)}
												</p>
												<Button
													onClick={() => {
														setAmount(String(suggestion));
														showToast("Sugestão copiada", "info");
													}}
													size="sm"
													type="button"
													variant="outline"
												>
													<LuCopy />
													Usar sugestão
												</Button>
											</div>
										) : (
											<p className="text-muted-foreground text-sm">
												Cotação indisponível. Informe débito efetivo.
											</p>
										)}
										<p className="text-muted-foreground text-xs">
											Valor informado prevalece sobre cotação diária e permanece registrado.
										</p>
									</>
								)}
							</>
						)}
					</div>
				</ScrollArea>
				{pending && <p role="status">Registrando pagamento...</p>}
				<DialogFooter>
					<Button disabled={pending} onClick={onClose} type="button" variant="outline">
						Descartar
					</Button>
					<Button
						disabled={
							pending ||
							loading ||
							!row ||
							accounts.isError ||
							!paidDate ||
							(!!account && amount === "" && suggestion === null)
						}
						onClick={async () => {
							if (!row) return;
							setPending(true);
							try {
								if (
									await onSave({
										accountAmount: accountId && amount !== "" ? Number(amount) : undefined,
										expectedPaymentId: row.id,
										financialAccountId: accountId || undefined,
										paidDate,
									})
								)
									onClose();
							} finally {
								setPending(false);
							}
						}}
						type="button"
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
