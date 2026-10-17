import { LuPencil, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { formatLocalDate } from "@/lib/date";

const formatMoney = (value: number, currency: string) =>
	new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(value);
export function BalanceAdjustmentRow({
	adjustment,
	pending,
	onEdit,
	onRemove,
}: {
	adjustment: BalanceAdjustment;
	pending: boolean;
	onEdit: (adjustment: BalanceAdjustment) => void;
	onRemove: (adjustment: BalanceAdjustment) => void;
}) {
	return (
		<div
			className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
			key={adjustment.id}
		>
			<div className="min-w-0">
				<p className="text-muted-foreground text-sm">{formatLocalDate(adjustment.date)}</p>
				<p className="text-muted-foreground text-sm">
					Saldo sem ajuste: {formatMoney(Number(adjustment.calculatedBalance), adjustment.currency ?? "BRL")}
				</p>
				<p className="text-sm">
					Saldo corrigido: {formatMoney(Number(adjustment.balance), adjustment.currency ?? "BRL")}
				</p>
			</div>
			<ActionGroup className="ml-auto shrink-0 gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Editar ajuste"
							className="cursor-pointer"
							disabled={pending}
							onClick={() => onEdit(adjustment)}
							size="icon-sm"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Editar</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<ConfirmActionButton
								aria-label="Excluir ajuste"
								className="cursor-pointer"
								confirmation="Excluir este ajuste permanentemente?"
								disabled={pending}
								onConfirm={() => onRemove(adjustment)}
								size="icon-sm"
								variant="outline"
							>
								<LuTrash2 />
							</ConfirmActionButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>Excluir</TooltipContent>
				</Tooltip>
			</ActionGroup>
		</div>
	);
}
