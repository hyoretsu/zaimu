import { Button } from "@/components/ui/Button";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";

export function PastTransactionsDialog({ onAddAll, onSkip }: { onAddAll: () => void; onSkip: () => void }) {
	return (
		<>
			<DialogHeader>
				<DialogTitle>Adicionar transações passadas?</DialogTitle>
				<DialogDescription>
					Esta recorrência começa no passado. Deseja adicionar somente as transações inexistentes desde a data
					inicial?
				</DialogDescription>
			</DialogHeader>
			<DialogFooter>
				<Button className="cursor-pointer" onClick={onSkip} variant="outline">
					Não adicionar
				</Button>
				<Button className="cursor-pointer" onClick={onAddAll}>
					Adicionar todas
				</Button>
			</DialogFooter>
		</>
	);
}
