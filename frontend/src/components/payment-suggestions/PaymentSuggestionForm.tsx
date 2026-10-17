import { useQuery, useQueryClient } from "@tanstack/react-query";
import { suggestedInvoicePaymentDate } from "@zaimu/finance/payment-suggestions";
import { useState } from "react";
import { TransactionConversionPreview } from "@/components/transactions/TransactionConversionPreview";
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
import type { PaymentSuggestion } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invoicePaymentPreferenceKey, readInvoicePaymentPreference } from "@/lib/invoice-payment-preference";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export interface PaymentSuggestionDraft {
	accountAmount: string;
	accountId: string;
	attemptId: string;
	date: string;
}

export function PaymentSuggestionForm({
	suggestion,
	onClose,
	initialDraft,
}: {
	suggestion: PaymentSuggestion;
	initialDraft?: PaymentSuggestionDraft;
	onClose: () => void;
}) {
	const currency = new Intl.NumberFormat("pt-BR", {
		currency: suggestion.currency ?? "BRL",
		style: "currency",
	});
	const [accountAmount, setAccountAmount] = useState(initialDraft?.accountAmount ?? "");
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const preference = useQuery({
		queryFn: readInvoicePaymentPreference,
		queryKey: invoicePaymentPreferenceKey(identity),
	});
	const [selectedDate, setDate] = useState(initialDraft?.date);
	const date = selectedDate ?? suggestedInvoicePaymentDate(suggestion, preference.data);
	const [accountId, setAccountId] = useState(initialDraft?.accountId ?? suggestion.financialAccountId);
	const [attemptId, setAttemptId] = useState(() => initialDraft?.attemptId ?? crypto.randomUUID());
	const accounts = useQuery({
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const payerCurrency = accounts.data?.find(account => account.id === accountId)?.currency ?? "BRL";
	const foreign = payerCurrency !== (suggestion.currency ?? "BRL");
	const [validationError, setValidationError] = useState("");
	const submit = () => {
		const parsedDate = new Date(`${date}T12:00:00Z`);
		if (
			(!initialDraft && (preference.isPending || preference.isError)) ||
			accounts.isPending ||
			accounts.isError ||
			!accounts.data?.some(
				account => account.id === accountId && !["CREDIT_CARD", "REWARDS"].includes(account.type),
			) ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			!Number.isFinite(parsedDate.getTime()) ||
			parsedDate.toISOString().slice(0, 10) !== date ||
			(foreign && (!Number.isFinite(Number(accountAmount)) || !(Number(accountAmount) > 0)))
		) {
			setValidationError(
				"Confira a data, selecione uma conta disponível e informe um débito válido. Aguarde o carregamento dos dados antes de salvar.",
			);
			return;
		}
		setValidationError("");
		const draft = { accountAmount, accountId, attemptId, date };
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["transaction"] },
			close: onClose,
			conflictKey: `card-payment:${suggestion.statementId}`,
			failureMessage: "Não foi possível registrar pagamento.",
			loadingMessage: "Registrando pagamento...",
			recovery: {
				entityId: suggestion.statementId,
				kind: "payment-suggestion",
				payload: { draft, suggestion },
			},
			run: () =>
				dataService.creditCards.confirmPaymentSuggestion(suggestion.creditCardId, {
					accountAmount: draft.accountAmount ? Number(draft.accountAmount) : undefined,
					amount: suggestion.amount,
					attemptId: draft.attemptId,
					date: draft.date,
					financialAccountId: draft.accountId,
					statementId: suggestion.statementId,
				}),
			successMessage: "Pagamento do cartão registrado.",
		});
	};
	return (
		<Dialog
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent className="sm:max-w-lg">
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-6"
					onSubmit={event => {
						event.preventDefault();
						submit();
					}}
				>
					<DialogHeader>
						<DialogTitle>Pagamento de {suggestion.cardName}</DialogTitle>
						<DialogDescription>Revise antes de registrar. Nenhum resgate será realizado.</DialogDescription>
					</DialogHeader>
					<DialogBody>
						{validationError && (
							<p className="text-danger text-sm" role="alert">
								{validationError}
							</p>
						)}
						<p className="font-semibold text-xl">{currency.format(suggestion.amount)}</p>
						{(initialDraft || (!preference.isPending && !preference.isError)) && foreign && (
							<>
								<TransactionConversionPreview
									amount={String(suggestion.amount)}
									bookingCurrency={suggestion.currency ?? "BRL"}
									date={date}
									fees={[]}
									onUse={value => {
										setAccountAmount(value);
										setAttemptId(crypto.randomUUID());
									}}
									sourceCurrency={suggestion.currency ?? "BRL"}
									targetCurrency={payerCurrency}
								/>
								<MoneyField
									currencyCode={payerCurrency}
									id="suggestion-account-amount"
									label="Débito efetivo na conta"
									onValueChange={value => {
										setAccountAmount(value);
										setAttemptId(crypto.randomUUID());
									}}
									required
									value={accountAmount}
								/>
							</>
						)}
						{!initialDraft && preference.isPending ? (
							<Skeleton className="h-20" />
						) : !initialDraft && preference.isError ? (
							<p className="text-danger text-sm" role="alert">
								Não foi possível carregar preferência de pagamento.
							</p>
						) : (
							<DateField
								id="suggestion-payment-date"
								label="Data do pagamento"
								name="payment-date"
								onValueChange={value => {
									setDate(value);
									setAttemptId(crypto.randomUUID());
								}}
								placeholder="03/10/2026"
								required
								value={date}
							/>
						)}
						{(initialDraft || (!preference.isPending && !preference.isError)) &&
							date > suggestion.dueDate && (
								<p className="text-amber-600 text-sm dark:text-amber-400" role="status">
									Data do pagamento após o vencimento da fatura. O pagamento será registrado no cartão.
								</p>
							)}
						{accounts.isPending ? (
							<Skeleton className="h-20" />
						) : (
							<CustomSelect
								label="Conta pagadora"
								onValueChange={value => {
									setAccountId(value);
									setAccountAmount("");
									setAttemptId(crypto.randomUUID());
								}}
								options={(accounts.data ?? [])
									.filter(account => !["CREDIT_CARD", "REWARDS"].includes(account.type))
									.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }))}
								placeholder="Selecione a conta pagadora"
								required
								searchable
								value={accountId}
							/>
						)}
						{accounts.isError && (
							<p className="text-danger text-sm">Não foi possível carregar contas pagadoras.</p>
						)}
					</DialogBody>
					<DialogFooter>
						<Button onClick={onClose} type="button" variant="outline">
							Cancelar
						</Button>
						<Button
							disabled={
								(!initialDraft && (preference.isPending || preference.isError)) ||
								accounts.isPending ||
								accounts.isError ||
								!accountId ||
								!date ||
								(foreign && !(Number(accountAmount) > 0))
							}
							type="submit"
						>
							Salvar pagamento
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
