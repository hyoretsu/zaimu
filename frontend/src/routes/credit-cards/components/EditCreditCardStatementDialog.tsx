import { useQueryClient } from "@tanstack/react-query";
import { assertStatementAmount } from "@zaimu/finance/credit-book";
import { useState } from "react";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { Button } from "@/components/ui/Button";
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
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { MoneyField } from "@/components/ui/MoneyField";
import type { CreditCardStatement } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { showToast } from "@/stores";

export function EditCreditCardStatementDialog({
	statement,
	currency,
	onOpenChange,
	initialValues,
}: {
	statement: CreditCardStatement;
	currency: string;
	initialValues?: { statementDate: string; dueDate: string; manualTotalAmount?: string };
	onOpenChange: (open: boolean) => void;
}) {
	const [statementDate, setStatementDate] = useState(
		initialValues?.statementDate ?? statement.statementDate.slice(0, 10),
	);
	const [dueDate, setDueDate] = useState(initialValues?.dueDate ?? statement.dueDate.slice(0, 10));
	const queryClient = useQueryClient();
	const [amount, setAmount] = useState(
		initialValues?.manualTotalAmount ??
			(statement.manualTotalAmount == null ? "" : String(statement.manualTotalAmount)),
	);
	const [error, setError] = useState("");
	const save = (manualTotalAmount: string) =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["statement"] },
			close: () => onOpenChange(false),
			conflictKey: `credit-statement:${statement.id}`,
			failureMessage: "Não foi possível editar a fatura.",
			loadingMessage: "Atualizando fatura...",
			recovery: {
				entityId: statement.id,
				kind: `credit-statement-action:${statement.id}`,
				payload: {
					action: "dates",
					cardId: statement.creditCardId,
					data: { dueDate, manualTotalAmount, statementDate },
					statement,
				},
			},
			run: async () => {
				if (
					!statement.isForecast &&
					(statementDate !== statement.statementDate.slice(0, 10) ||
						dueDate !== statement.dueDate.slice(0, 10))
				) {
					await dataService.creditCards.updateStatementDates(statement.creditCardId, statement.id, {
						dueDate,
						statementDate,
					});
				}
				const value = manualTotalAmount === "" ? null : Number(manualTotalAmount);
				if (value !== (statement.manualTotalAmount ?? null)) {
					await dataService.creditCards.setStatementAmount(statement.creditCardId, statement.id, value, {
						dueDate,
						statementDate,
					});
				}
			},
			successMessage: "Fatura atualizada.",
		});
	const invalidDates = Boolean(statementDate && dueDate && dueDate < statementDate);
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar fatura</DialogTitle>
					<DialogDescription>
						Altere fechamento, vencimento e valor da fatura. Compras e parcelas serão redistribuídas conforme
						as novas datas.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (!statementDate || !dueDate || invalidDates) return;
						const raw = String(new FormData(event.currentTarget).get("manualTotalAmount") ?? "").trim();
						try {
							if (raw !== "") assertStatementAmount(Number(raw), currency);
						} catch {
							setError("Informe um valor válido, com as casas decimais da moeda e menor que 1 trilhão.");
							return;
						}
						setError("");
						save(raw);
					}}
				>
					<DialogBody>
						<FormFieldRow>
							<DateField
								disabled={statement.isForecast}
								id="statement-closing-date"
								label="Fechamento"
								name="statement-closing-date"
								onValueChange={setStatementDate}
								required
								value={statementDate}
							/>
							<DateField
								disabled={statement.isForecast}
								error={invalidDates ? "Vencimento deve ser igual ou posterior ao fechamento." : undefined}
								id="statement-due-date"
								label="Vencimento"
								min={statementDate}
								name="statement-due-date"
								onValueChange={setDueDate}
								required
								value={dueDate}
							/>
						</FormFieldRow>
						<div className="mt-5 space-y-3">
							<p className="text-muted-foreground text-sm">
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
								id="statement-manual-total"
								label="Valor ajustado"
								onValueChange={setAmount}
								rawValueName="manualTotalAmount"
								value={amount}
							/>
							<p className="text-muted-foreground text-sm">
								Informe o total final, incluindo saldo anterior e créditos. Pagamentos abatem depois. Deixe
								vazio para usar o valor calculado.
							</p>
							{error && (
								<p className="text-destructive text-sm" role="alert">
									{error}
								</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button
							onClick={() => {
								setAmount("");
								showToast("Valor calculado será usado ao salvar.", "info");
							}}
							type="button"
							variant="outline"
						>
							Restaurar calculado
						</Button>
						<Button onClick={() => onOpenChange(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button disabled={!statementDate || !dueDate || invalidDates} type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
