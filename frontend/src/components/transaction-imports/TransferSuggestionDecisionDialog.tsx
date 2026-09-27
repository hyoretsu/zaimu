import { LuArrowLeftRight, LuX } from "react-icons/lu";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { DialogDescription, DialogFooter, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import type { Transaction } from "@/lib/api";
import { TransferSuggestionTransactionSummary } from "./TransferSuggestionTransactionSummary";

export function TransferSuggestionDecisionDialog({
	counterpartTransaction,
	currentTransaction,
	onAccept,
	onOpenChange,
	onReject,
	open,
	pending,
	rejectConfirmation = "Nunca sugerir este par novamente?",
	rejectLabel = "Recusar",
}: {
	counterpartTransaction: Transaction | null;
	currentTransaction: Transaction | null;
	onAccept: () => void;
	onOpenChange: (open: boolean) => void;
	onReject: () => void;
	open: boolean;
	pending: boolean;
	rejectConfirmation?: string | null;
	rejectLabel?: string;
}) {
	if (!currentTransaction || !counterpartTransaction) return null;
	return (
		<ImportDialog onOpenChange={onOpenChange} open={open}>
			<ImportDialogContent>
				<DialogHeader>
					<DialogTitle>Transferência sugerida</DialogTitle>
					<DialogDescription>Confira a transação e sua possível transferência.</DialogDescription>
				</DialogHeader>
				<div className="space-y-3">
					<TransferSuggestionTransactionSummary transaction={currentTransaction} />
					<div className="flex justify-center text-primary">
						<LuArrowLeftRight aria-label="Possível transferência" />
					</div>
					<TransferSuggestionTransactionSummary transaction={counterpartTransaction} />
				</div>
				<DialogFooter className="grid grid-cols-1 sm:grid-cols-3">
					<Button
						className="w-full cursor-pointer"
						disabled={pending}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Cancelar
					</Button>
					{rejectConfirmation ? (
						<ConfirmActionButton
							className="w-full cursor-pointer disabled:cursor-not-allowed"
							confirmation={rejectConfirmation}
							confirmChildren={
								<>
									<LuX aria-hidden="true" /> Confirmar
								</>
							}
							disabled={pending}
							onConfirm={onReject}
							variant="outline"
						>
							<LuX aria-hidden="true" /> {rejectLabel}
						</ConfirmActionButton>
					) : (
						<Button
							className="w-full cursor-pointer disabled:cursor-not-allowed"
							disabled={pending}
							onClick={onReject}
							variant="outline"
						>
							<LuX aria-hidden="true" /> {rejectLabel}
						</Button>
					)}
					<Button
						className="w-full cursor-pointer disabled:cursor-not-allowed"
						disabled={pending}
						onClick={onAccept}
					>
						<LuArrowLeftRight aria-hidden="true" /> {pending ? "Combinando…" : "Combinar"}
					</Button>
				</DialogFooter>
			</ImportDialogContent>
		</ImportDialog>
	);
}
