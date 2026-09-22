import { LuFileSearch } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { CreditCardImportSummary } from "@/lib/api";

export function PendingCreditCardImportsDialog({
	imports,
	onOpenChange,
	onReview,
	open,
}: {
	imports: CreditCardImportSummary[];
	onOpenChange: (open: boolean) => void;
	onReview: (importId: string) => void;
	open: boolean;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="grid max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Selecionar fatura para revisão</DialogTitle>
					<DialogDescription>
						Escolha uma fatura. As importadas mais recentemente aparecem primeiro.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 min-w-0 pr-3">
					<div className="min-w-0 space-y-2">
						{imports.map(creditCardImport => (
							<Button
								className="h-auto w-full min-w-0 max-w-full cursor-pointer justify-start gap-3 overflow-hidden whitespace-normal px-4 py-3 text-left"
								key={creditCardImport.id}
								onClick={() => {
									onOpenChange(false);
									onReview(creditCardImport.id);
								}}
								variant="outline"
							>
								<LuFileSearch className="mt-0.5 size-5 shrink-0 text-amber-700" />
								<span className="w-0 min-w-0 flex-1 space-y-1 overflow-hidden">
									<span className="block truncate font-semibold">{creditCardImport.fileName}</span>
									<span className="block truncate text-muted-foreground text-xs">
										{creditCardImport.pendingItemCount}{" "}
										{creditCardImport.pendingItemCount === 1 ? "compra restante" : "compras restantes"}
									</span>
								</span>
							</Button>
						))}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
