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
import { Skeleton } from "@/components/ui/Skeleton";
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
	loading = false,
	error = false,
}: {
	name: string;
	entries: BalanceAdjustment[];
	onClose: () => void;
	onAdd: () => void;
	onEdit: (adjustment: BalanceAdjustment) => void;
	onRemove: (adjustment: BalanceAdjustment) => void;
	isPending: (id: string) => boolean;
	children: ReactNode;
	loading?: boolean;
	error?: boolean;
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
						{loading ? (
							<Skeleton className="h-28 rounded-xl" />
						) : error ? (
							<p className="text-destructive text-sm">Não foi possível carregar os ajustes.</p>
						) : entries.length === 0 ? (
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
