import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
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
import type { CreditCardStatement } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";

export function EditCreditCardStatementDialog({
	statement,
	onOpenChange,
	initialValues,
}: {
	statement: CreditCardStatement;
	initialValues?: { statementDate: string; dueDate: string };
	onOpenChange: (open: boolean) => void;
}) {
	const [statementDate, setStatementDate] = useState(
		initialValues?.statementDate ?? statement.statementDate.slice(0, 10),
	);
	const [dueDate, setDueDate] = useState(initialValues?.dueDate ?? statement.dueDate.slice(0, 10));
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const save = () =>
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["statement"] },
			close: () => onOpenChange(false),
			conflictKey: `credit-statement:${statement.id}`,
			failureMessage: "Não foi possível editar a fatura.",
			loadingMessage: "Atualizando datas da fatura...",
			recovery: {
				entityId: statement.id,
				kind: `credit-statement-action:${statement.id}`,
				payload: {
					action: "dates",
					cardId: statement.creditCardId,
					data: { dueDate, statementDate },
					statement,
				},
			},
			run: () =>
				dataService.creditCards.updateStatementDates(statement.creditCardId, statement.id, {
					dueDate,
					statementDate,
				}),
			successMessage: "Datas da fatura atualizadas.",
		});
	const invalidDates = Boolean(statementDate && dueDate && dueDate < statementDate);
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Editar fatura</DialogTitle>
					<DialogDescription>
						Altere fechamento e vencimento. Compras e parcelas serão redistribuídas conforme as novas datas.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (statementDate && dueDate && !invalidDates) save();
					}}
				>
					<DialogBody>
						<FormFieldRow>
							<DateField
								id="statement-closing-date"
								label="Fechamento"
								name="statement-closing-date"
								onValueChange={setStatementDate}
								required
								value={statementDate}
							/>
							<DateField
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
					</DialogBody>
					<DialogFooter>
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
