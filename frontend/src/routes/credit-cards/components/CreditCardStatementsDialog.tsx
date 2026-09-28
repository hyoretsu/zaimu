import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import type { CreditCard } from "@/lib/api";
import { CreditCardStatementBrowser } from "./CreditCardStatementBrowser";

export function CreditCardStatementsDialog({
	card,
	onOpenChange,
}: {
	card: CreditCard | null;
	onOpenChange: (open: boolean) => void;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={Boolean(card)}>
			<DialogContent className="grid max-h-[min(90dvh,46rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden p-4 sm:max-w-5xl sm:gap-6 sm:p-6">
				<DialogHeader>
					<DialogTitle>Faturas de {card?.accountName ?? "Cartão de crédito"}</DialogTitle>
					<DialogDescription>Selecione um mês para consultar os detalhes e as transações.</DialogDescription>
				</DialogHeader>
				{card && <CreditCardStatementBrowser card={card} key={card.id} />}
			</DialogContent>
		</Dialog>
	);
}
