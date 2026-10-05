import { LuCreditCard, LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { CreditPurchase } from "@/lib/api";

export function CreditPurchaseEditScopeDialog({
	onOpenChange,
	onSelect,
	purchase,
}: {
	onOpenChange: (open: boolean) => void;
	onSelect: (scope: "installment" | "purchase") => void;
	purchase: CreditPurchase;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>O que deseja editar?</DialogTitle>
					<DialogDescription>
						Escolha entre alterar somente o valor da parcela {purchase.currentInstallment}/
						{purchase.installments}
						ou editar os dados da compra original e suas próximas parcelas.
					</DialogDescription>
				</DialogHeader>
				<DialogFooter>
					<Button onClick={() => onSelect("installment")} variant="outline">
						<LuPencil /> Parcela atual
					</Button>
					<Button onClick={() => onSelect("purchase")}>
						<LuCreditCard /> Compra original
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
