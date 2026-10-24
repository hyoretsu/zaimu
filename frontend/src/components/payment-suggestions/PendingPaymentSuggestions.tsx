import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuWalletCards } from "react-icons/lu";
import { ActionNotice } from "@/components/ui/ActionNotice";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { PaymentSuggestion } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type PaymentSuggestionDraft, PaymentSuggestionForm } from "./PaymentSuggestionForm";

const dateFormat = new Intl.DateTimeFormat("pt-BR");

export function PendingPaymentSuggestions() {
	const identity = useCacheIdentity();
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState<PaymentSuggestion | null>(null);
	const [draft, setDraft] = useState<PaymentSuggestionDraft>();
	const pending = useModalRecoveryStore(state => state.pending);
	useBackgroundModalRecovery<{ suggestion: PaymentSuggestion; draft: PaymentSuggestionDraft }>(
		"payment-suggestion",
		entry => {
			setSelected(entry.payload.suggestion);
			setDraft(entry.payload.draft);
		},
	);
	const suggestions = useQuery({
		enabled: Boolean(identity),
		queryFn: () => dataService.creditCards.getPaymentSuggestions(),
		queryKey: [...queryKeys.creditCards.list(identity!), "payment-suggestions"],
	});
	const accounts = useQuery({
		enabled: Boolean(identity) && open,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	if (!identity) return null;
	if (suggestions.isPending && !selected) return null;
	if (suggestions.isError && !selected)
		return <p className="text-muted-foreground text-sm">Sugestões de pagamento indisponíveis.</p>;
	if (!suggestions.data?.length && !selected) return null;
	return (
		<>
			<ActionNotice
				action={
					<Button onClick={() => setOpen(true)} variant="outline">
						<LuWalletCards /> Revisar pagamentos
					</Button>
				}
				description="Faturas fechadas aguardam revisão. Nenhum pagamento automático."
				icon={<LuWalletCards />}
				title={`${suggestions.data?.length ?? 0} ${(suggestions.data?.length ?? 0) === 1 ? "fatura pendente" : "faturas pendentes"}`}
			/>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="sm:max-w-2xl">
					<DialogHeader>
						<DialogTitle>Faturas pendentes</DialogTitle>
						<DialogDescription>
							Escolha uma fatura para revisar conta pagadora, data e saldo restante.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						{accounts.isPending ? (
							<Skeleton className="h-36" />
						) : accounts.isError ? (
							<p className="text-destructive text-sm">Não foi possível carregar contas pagadoras.</p>
						) : (
							(suggestions.data ?? []).map(suggestion => (
								<div
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
									key={`${suggestion.creditCardId}:${suggestion.statementId}`}
								>
									<div>
										<p className="font-semibold">{suggestion.cardName}</p>
										<p className="text-muted-foreground text-sm">
											Vencimento {dateFormat.format(new Date(`${suggestion.dueDate}T12:00:00`))}
										</p>
										<p>
											{new Intl.NumberFormat("pt-BR", {
												currency: suggestion.currency ?? "BRL",
												style: "currency",
											}).format(suggestion.amount)}
										</p>
										<p className="text-muted-foreground text-sm">
											Conta pagadora:{" "}
											{accounts.data?.find(account => account.id === suggestion.financialAccountId)
												? getFinancialAccountOptionLabel(
														accounts.data.find(account => account.id === suggestion.financialAccountId)!,
													)
												: "Conta indisponível"}
										</p>
									</div>
									<Button
										className="ml-auto"
										disabled={!!pending[`${identity}:card-payment:${suggestion.statementId}`]}
										onClick={() => {
											setDraft(undefined);
											setSelected(suggestion);
										}}
										variant="outline"
									>
										<LuWalletCards /> Revisar pagamento
									</Button>
								</div>
							))
						)}
					</DialogBody>
				</DialogContent>
			</Dialog>
			{selected && (
				<PaymentSuggestionForm
					initialDraft={draft}
					key={`${selected.statementId}:${selected.amount}`}
					onClose={() => {
						setSelected(null);
						setDraft(undefined);
					}}
					suggestion={selected}
				/>
			)}
		</>
	);
}
