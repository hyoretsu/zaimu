import { LuCheck, LuListChecks } from "react-icons/lu";
import { ImportDialog, ImportDialogContent } from "@/components/imports";
import { Button } from "@/components/ui/Button";
import {
	DialogBody,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";

export function ApproveImportedPurchasesDialog({
	onApprove,
	onOpenChange,
	open,
}: {
	onApprove: (includeUnmatched: boolean) => void;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	return (
		<ImportDialog onOpenChange={onOpenChange} open={open}>
			<ImportDialogContent>
				<DialogHeader>
					<DialogTitle>Quais compras aprovar?</DialogTitle>
					<DialogDescription>
						Escolha se deseja incluir compras sem correspondência no Zaimu.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<p className="text-muted-foreground text-sm">
						Compras sem correspondência serão criadas com os dados da fatura, que podem ter nomes abreviados e
						não ter etiquetas ou horário. Se não forem incluídas, continuarão na revisão. Itens com pendências
						permanecem na revisão em qualquer escolha.
					</p>
				</DialogBody>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Cancelar
					</Button>
					<Button onClick={() => onApprove(false)} variant="outline">
						<LuCheck /> Somente correspondentes
					</Button>
					<Button onClick={() => onApprove(true)}>
						<LuListChecks /> Incluir sem correspondência
					</Button>
				</DialogFooter>
			</ImportDialogContent>
		</ImportDialog>
	);
}
