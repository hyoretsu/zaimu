import { LuEye } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { Transaction } from "@/lib/api";
import { formatLocalDate, formatLocalTime } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

interface TransferSuggestion {
	counterpart: Transaction;
	transaction: Transaction;
}

export function TransferSuggestionsDialog({
	onOpenChange,
	onSelect,
	open,
	suggestions,
}: {
	onOpenChange: (open: boolean) => void;
	onSelect: (suggestion: TransferSuggestion) => void;
	open: boolean;
	suggestions: TransferSuggestion[];
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Transferências sugeridas</DialogTitle>
					<DialogDescription>
						Confira os pares encontrados antes de confirmar uma transferência.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 min-w-0 pr-3">
					<div className="min-w-0 space-y-2">
						{suggestions.map(({ counterpart, transaction }) => (
							<div
								className="flex min-w-0 flex-col gap-3 rounded-xl border bg-card p-3 sm:flex-row sm:items-center sm:justify-between"
								key={`${transaction.id}-${counterpart.id}`}
							>
								<div className="min-w-0 space-y-1">
									<p className="break-words font-medium">
										{transaction.description || "Saída"} ↔ {counterpart.description || "Entrada"}
									</p>
									<p className="text-muted-foreground text-xs">
										{formatLocalDate(transaction.date)} · {currency.format(Number(transaction.amount))} ·{" "}
										{formatLocalTime(transaction.time) ?? "Sem horário"}
										{counterpart.time ? ` ↔ ${formatLocalTime(counterpart.time)}` : ""}
									</p>
								</div>
								<Button
									className="shrink-0 cursor-pointer disabled:cursor-not-allowed"
									onClick={() => onSelect({ counterpart, transaction })}
									size="sm"
									variant="outline"
								>
									<LuEye aria-hidden="true" /> Ver 2 transações
								</Button>
							</div>
						))}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
