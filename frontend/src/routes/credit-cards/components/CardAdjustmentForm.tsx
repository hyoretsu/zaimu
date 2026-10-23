import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { ignoredThroughStatement } from "@/lib/card-adjustment";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { statementLabel } from "@/lib/statement-label";

export interface CardAdjustmentDraft {
	card: CreditCard | null;
	cardId: string;
	statementDate: string;
}

export function CardAdjustmentForm({
	card,
	cards,
	initialDraft,
	onClose,
}: {
	card: CreditCard | null;
	cards: CreditCard[];
	initialDraft?: CardAdjustmentDraft;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [cardId, setCardId] = useState(initialDraft?.cardId ?? card?.id ?? "");
	const statements = useQuery({
		enabled: Boolean(cardId) && identity !== null,
		queryFn: () => dataService.creditCards.getStatements(cardId),
		queryKey: [...queryKeys.creditCardStatements.list(identity!, cardId), "adjustment"],
	});
	const [statementDate, setStatementDate] = useState<string | null>(initialDraft?.statementDate ?? null);
	const originalDate =
		card && statements.data
			? (ignoredThroughStatement(statements.data, card.ignoreStatementsBefore)?.statementDate.slice(0, 10) ??
				null)
			: null;
	const chosenDate = statementDate ?? originalDate ?? "";
	const availableStatements = (statements.data ?? [])
		.filter(
			statement =>
				statement.totalAmount !== 0 &&
				!statement.isForecast &&
				statement.statementDate.slice(0, 10) <= getLocalDateKey(),
		)
		.toSorted((a, b) => b.statementDate.localeCompare(a.statementDate));
	const save = () => {
		const draft = { card, cardId, statementDate: chosenDate };
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["creditCard"] },
			close: onClose,
			conflictKey: `card-adjustment:${cardId}`,
			failureMessage: "Não foi possível salvar o ajuste de cartão.",
			loadingMessage: "Salvando ajuste de cartão...",
			recovery: { entityId: cardId, kind: "card-adjustment", payload: draft },
			run: () => dataService.creditCards.setStatementCutoff(draft.cardId, draft.statementDate),
			successMessage: "Ajuste de cartão salvo.",
		});
	};
	return (
		<Dialog onOpenChange={open => !open && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{card ? "Editar ajuste de cartão" : "Novo ajuste de cartão"}</DialogTitle>
					<DialogDescription>
						A fatura escolhida e todas as anteriores deixam de afetar limite, pendências e saldos.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
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
									label: statementLabel(statement, statements.data ?? []),
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
				</DialogBody>
				<DialogFooter>
					<Button className="cursor-pointer" onClick={onClose} variant="outline">
						Descartar
					</Button>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!cardId || !chosenDate || !statements.isSuccess}
						onClick={save}
					>
						Salvar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
