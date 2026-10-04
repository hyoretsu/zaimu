import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import type { PaymentSuggestion } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function PaymentSuggestionForm({
	suggestion,
	onClose,
}: {
	suggestion: PaymentSuggestion;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [date, setDate] = useState(getLocalDateKey(new Date()));
	const [accountId, setAccountId] = useState(suggestion.financialAccountId);
	const [attemptId, setAttemptId] = useState(() => crypto.randomUUID());
	const [error, setError] = useState<string | null>(null);
	const accounts = useQuery({
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const payment = useMutation({
		mutationFn: () =>
			dataService.creditCards.confirmPaymentSuggestion(suggestion.creditCardId, {
				amount: suggestion.amount,
				attemptId,
				date,
				financialAccountId: accountId,
				statementId: suggestion.statementId,
			}),
		onError: error => setError(error.message),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "transaction");
			showToast("Pagamento da fatura registrado.", "positive");
			onClose();
		},
	});
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !payment.isPending) onClose();
			}}
			open
		>
			<DialogContent className="max-h-[90dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="min-h-0">
					<form
						className="grid gap-4 p-6"
						onSubmit={event => {
							event.preventDefault();
							setError(null);
							payment.mutate();
						}}
					>
						<DialogHeader>
							<DialogTitle>Pagamento de {suggestion.cardName}</DialogTitle>
							<DialogDescription>Revise antes de registrar. Nenhum resgate será realizado.</DialogDescription>
						</DialogHeader>
						<p className="font-semibold text-xl">{currency.format(suggestion.amount)}</p>
						<DateField
							disabled={payment.isPending}
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
						{accounts.isPending ? (
							<Skeleton className="h-20" />
						) : (
							<CustomSelect
								disabled={payment.isPending}
								label="Conta pagadora"
								onValueChange={value => {
									setAccountId(value);
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
							<p className="text-destructive text-sm">Não foi possível carregar contas pagadoras.</p>
						)}
						{error && (
							<p className="text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
						{payment.isPending && (
							<p aria-live="polite" className="text-muted-foreground text-sm">
								Validando saldo e registrando pagamento...
							</p>
						)}
						<DialogFooter>
							<Button disabled={payment.isPending} onClick={onClose} type="button" variant="outline">
								Cancelar
							</Button>
							<Button
								disabled={payment.isPending || accounts.isPending || accounts.isError || !accountId || !date}
								type="submit"
							>
								Salvar pagamento
							</Button>
						</DialogFooter>
					</form>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
