import { LuGitMerge } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { CreditCardImportItem, CreditCardImportPurchaseDuplicate } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditPurchaseReconciliationDialog({
	item,
	onOpenChange,
	onReconcile,
	open,
	pending,
}: {
	item: CreditCardImportItem | null;
	onOpenChange: (open: boolean) => void;
	onReconcile: (candidate: CreditCardImportPurchaseDuplicate) => void;
	open: boolean;
	pending: boolean;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[calc(100dvh-2rem)] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Conciliar parcelas existentes</DialogTitle>
					<DialogDescription>
						Associe parcelas já registradas ao parcelamento importado. Parcelas ausentes serão criadas na
						aprovação.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 pr-3">
					<div className="grid gap-3">
						{item?.duplicates.map(candidate => (
							<Button
								className="h-auto cursor-pointer justify-start whitespace-normal p-4 text-left"
								disabled={pending}
								key={candidate.id}
								onClick={() => onReconcile(candidate)}
								variant="outline"
							>
								<LuGitMerge className="shrink-0" />
								<span>
									<strong className="block">{candidate.storeName || candidate.description}</strong>
									<span className="text-muted-foreground text-xs">
										{formatLocalDate(candidate.purchaseDate)} · {candidate.existingInstallments} parcelas
										registradas · {currency.format(candidate.installmentAmount)} por parcela
									</span>
								</span>
							</Button>
						))}
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button
						className="cursor-pointer"
						disabled={pending}
						onClick={() => onOpenChange(false)}
						variant="outline"
					>
						Fechar
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
