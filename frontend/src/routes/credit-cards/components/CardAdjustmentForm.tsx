import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard } from "@/lib/api";
import { ignoredThroughStatement } from "@/lib/card-adjustment";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { formatLocalMonthYear, getLocalDateKey } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function CardAdjustmentForm({
	card,
	cards,
	onClose,
}: {
	card: CreditCard | null;
	cards: CreditCard[];
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [cardId, setCardId] = useState(card?.id ?? "");
	const statements = useQuery({
		enabled: Boolean(cardId) && identity !== null,
		queryFn: () => dataService.creditCards.getStatements(cardId),
		queryKey: [...queryKeys.creditCardStatements.list(identity!, cardId), "adjustment"],
	});
	const [statementDate, setStatementDate] = useState<string | null>(null);
	const originalDate =
		card && statements.data
			? (ignoredThroughStatement(statements.data, card.ignoreStatementsBefore)?.statementDate.slice(0, 10) ??
				null)
			: null;
	const chosenDate = statementDate ?? originalDate ?? "";
	const availableStatements = (statements.data ?? [])
		.filter(statement => !statement.isForecast && statement.statementDate.slice(0, 10) <= getLocalDateKey())
		.toSorted((a, b) => b.statementDate.localeCompare(a.statementDate));
	const save = useMutation({
		mutationFn: () => dataService.creditCards.setStatementCutoff(cardId, chosenDate),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "creditCard");
			showToast("Ajuste de cartão salvo.", "positive");
			onClose();
		},
	});
	return (
		<Dialog onOpenChange={open => !open && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{card ? "Editar ajuste de cartão" : "Novo ajuste de cartão"}</DialogTitle>
					<DialogDescription>
						A fatura escolhida e todas as anteriores deixam de afetar limite, pendências e saldos.
					</DialogDescription>
				</DialogHeader>
				<div className="grid gap-4">
					<CustomSelect
						disabled={Boolean(card)}
						label="Cartão"
						onValueChange={value => {
							setCardId(value);
							setStatementDate(null);
						}}
						options={cards
							.filter(item => card || !item.ignoreStatementsBefore)
							.map(item => ({
								label: getCreditCardDisplayName(item),
								value: item.id,
							}))}
						placeholder="Selecione o cartão"
						required
						searchable
						value={cardId}
					/>
					{cardId && statements.isPending ? <Skeleton className="h-16 rounded-xl" /> : null}
					{cardId && statements.isError ? (
						<p className="text-destructive text-sm">Não foi possível carregar as faturas.</p>
					) : null}
					{cardId && statements.isSuccess ? (
						<CustomSelect
							label="Desconsiderar até a fatura"
							onValueChange={setStatementDate}
							options={availableStatements.map(statement => ({
								label: formatLocalMonthYear(statement.dueDate),
								value: statement.statementDate.slice(0, 10),
							}))}
							placeholder={availableStatements.length ? "Selecione a fatura" : "Nenhuma fatura histórica"}
							required
							searchable
							sortOptions={false}
							value={chosenDate}
						/>
					) : null}
				</div>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={onClose} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!cardId || !chosenDate || !statements.isSuccess || save.isPending}
						onClick={() => save.mutate()}
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
