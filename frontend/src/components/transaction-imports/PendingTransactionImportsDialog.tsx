import { LuFileSearch } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { TransactionImportSummary } from "@/lib/api";

export function PendingTransactionImportsDialog({
	imports,
	onOpenChange,
	onReview,
	open,
}: {
	imports: TransactionImportSummary[];
	onOpenChange: (open: boolean) => void;
	onReview: (importId: string) => void;
	open: boolean;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Selecionar extrato para revisão</DialogTitle>
					<DialogDescription>
						Escolha um extrato. Os com menos transações restantes aparecem primeiro; em caso de
						empate, os mais recentes.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
						<div className="min-w-0 space-y-2">
							{imports.map(transactionImport => (
								<Button
									className="h-auto w-full max-w-full min-w-0 cursor-pointer justify-start gap-3 overflow-hidden px-4 py-3 text-left whitespace-normal"
									key={transactionImport.id}
									onClick={() => {
										onOpenChange(false);
										onReview(transactionImport.id);
									}}
									variant="outline"
								>
									<LuFileSearch className="mt-0.5 size-5 shrink-0 text-amber-700" />
									<span className="w-0 min-w-0 flex-1 space-y-1 overflow-hidden">
										<span className="block truncate font-semibold">
											{transactionImport.fileName}
										</span>
										<span className="text-muted-foreground block truncate text-xs">
											{transactionImport.pendingItemCount}{" "}
											{transactionImport.pendingItemCount === 1
												? "transação restante"
												: "transações restantes"}
										</span>
									</span>
								</Button>
							))}
						</div>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
