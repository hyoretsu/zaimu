import type { ReactNode } from "react";
import { LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { BalanceAdjustmentRow } from "./BalanceAdjustmentRow";
export function AccountAdjustmentsDialog({
	name,
	entries,
	onClose,
	onAdd,
	onEdit,
	onRemove,
	isPending,
	children,
}: {
	name: string;
	entries: BalanceAdjustment[];
	onClose: () => void;
	onAdd: () => void;
	onEdit: (adjustment: BalanceAdjustment) => void;
	onRemove: (adjustment: BalanceAdjustment) => void;
	isPending: (id: string) => boolean;
	children: ReactNode;
}) {
	return (
		<Dialog onOpenChange={open => !open && onClose()} open>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>{name}</DialogTitle>
					<DialogDescription>Ajustes de saldo ao fim de cada dia.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid gap-2">
						{entries.length === 0 ? (
							<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
						) : (
							entries.map(adjustment => (
								<BalanceAdjustmentRow
									adjustment={adjustment}
									key={adjustment.id}
									onEdit={onEdit}
									onRemove={onRemove}
									pending={isPending(adjustment.id)}
								/>
							))
						)}
					</div>
				</DialogBody>
				<DialogFooter>
					<Button onClick={onAdd}>
						<LuPlus /> Adicionar data
					</Button>
				</DialogFooter>
			</DialogContent>
			{children}
		</Dialog>
	);
}
