import { useMutation, useQueryClient } from "@tanstack/react-query";
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
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function EditCreditCardStatementDialog({
	statement,
	onOpenChange,
}: {
	statement: CreditCardStatement;
	onOpenChange: (open: boolean) => void;
}) {
	const [statementDate, setStatementDate] = useState(statement.statementDate.slice(0, 10));
	const [dueDate, setDueDate] = useState(statement.dueDate.slice(0, 10));
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const update = useMutation({
		mutationFn: () =>
			dataService.creditCards.updateStatementDates(statement.creditCardId, statement.id, {
				dueDate,
				statementDate,
			}),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível editar a fatura.", "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "statement");
			showToast("Datas da fatura atualizadas.", "positive");
			onOpenChange(false);
		},
	});
	const invalidDates = Boolean(statementDate && dueDate && dueDate < statementDate);
	return (
		<Dialog onOpenChange={open => !update.isPending && onOpenChange(open)} open>
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
						if (!update.isPending && statementDate && dueDate && !invalidDates) update.mutate();
					}}
				>
					<DialogBody>
						<FormFieldRow>
							<DateField
								disabled={update.isPending}
								id="statement-closing-date"
								label="Fechamento"
								name="statement-closing-date"
								onValueChange={setStatementDate}
								required
								value={statementDate}
							/>
							<DateField
								disabled={update.isPending}
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
						<Button
							disabled={update.isPending}
							onClick={() => onOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button disabled={update.isPending || !statementDate || !dueDate || invalidDates} type="submit">
							{update.isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
