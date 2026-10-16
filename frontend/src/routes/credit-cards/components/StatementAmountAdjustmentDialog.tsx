import { useMutation, useQueryClient } from "@tanstack/react-query";
import { assertStatementAmount } from "@zaimu/finance/credit-book";
import { useState } from "react";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
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
import { MoneyField } from "@/components/ui/MoneyField";
import type { CreditCardStatement } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function StatementAmountAdjustmentDialog({
	statement,
	currency,
	onClose,
}: {
	statement: CreditCardStatement;
	currency: string;
	onClose: () => void;
}) {
	const [amount, setAmount] = useState(
		statement.manualTotalAmount == null ? "" : String(statement.manualTotalAmount),
	);
	const [error, setError] = useState("");
	const client = useQueryClient();
	const identity = useCacheIdentity();
	const mutation = useMutation({
		mutationFn: (value: number | null) =>
			dataService.creditCards.setStatementAmount(statement.creditCardId, statement.id, value, {
				dueDate: statement.dueDate.slice(0, 10),
				statementDate: statement.statementDate.slice(0, 10),
			}),
		onError: error => setError(error instanceof Error ? error.message : "Não foi possível salvar o ajuste."),
		onSuccess: async () => {
			await invalidateCacheOperation(client, identity!, "statement");
			showToast("Ajuste de fatura atualizado.", "positive");
			onClose();
		},
	});
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !mutation.isPending) onClose();
			}}
			open
		>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Ajustar valor da fatura</DialogTitle>
					<DialogDescription>
						Informe o total final da fatura, incluindo saldo anterior e créditos. Pagamentos abatem depois.
						Ajustes sem diferença são removidos automaticamente.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						const raw = String(new FormData(event.currentTarget).get("manualTotalAmount") ?? "").trim();
						const value = Number(raw);
						if (!raw || !Number.isFinite(value)) {
							setError("Informe um valor válido para a fatura.");
							return;
						}
						try {
							assertStatementAmount(value, currency);
						} catch {
							setError("Informe um valor válido, com as casas decimais da moeda e menor que 1 trilhão.");
							return;
						}
						setError("");
						mutation.mutate(value);
					}}
				>
					<DialogBody>
						<p className="mb-4 text-muted-foreground text-sm">
							Valor calculado:{" "}
							<PreferredMoneyAmount
								values={[
									{
										amount:
											statement.calculatedTotalAmount ??
											statement.totalAmount + (statement.chargesAmount ?? 0),
										currency,
									},
								]}
							/>
						</p>
						<MoneyField
							currencyCode={currency}
							disabled={mutation.isPending}
							id="statement-manual-total"
							label="Valor ajustado"
							onValueChange={setAmount}
							rawValueName="manualTotalAmount"
							required
							value={amount}
						/>
						{error && (
							<p className="mt-2 text-destructive text-sm" role="alert">
								{error}
							</p>
						)}
						{mutation.isPending && (
							<p className="mt-2 text-muted-foreground text-sm" role="status">
								Salvando ajuste...
							</p>
						)}
					</DialogBody>
					<DialogFooter>
						{statement.manualTotalAmount != null && (
							<Button
								disabled={mutation.isPending}
								onClick={() => mutation.mutate(null)}
								type="button"
								variant="outline"
							>
								Restaurar calculado
							</Button>
						)}
						<Button disabled={mutation.isPending} onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button disabled={mutation.isPending} type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
