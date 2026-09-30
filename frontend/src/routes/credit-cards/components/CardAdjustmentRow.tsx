import { LuPencil, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditCard } from "@/lib/api";
import { getCreditCardDisplayName } from "@/lib/credit-card";
import { formatLocalMonthYear } from "@/lib/date";

export function CardAdjustmentRow({
	card,
	onEdit,
	onRemove,
	pending,
	statementDate,
}: {
	card: CreditCard;
	onEdit: () => void;
	onRemove: () => void;
	pending: boolean;
	statementDate: string | null;
}) {
	return (
		<div className="flex items-center justify-between gap-3 rounded-xl border p-3">
			<div className="min-w-0">
				<p className="truncate font-medium">{getCreditCardDisplayName(card)}</p>
				<p className="text-muted-foreground text-sm">
					{statementDate
						? `Faturas até ${formatLocalMonthYear(statementDate)} desconsideradas`
						: "Faturas anteriores desconsideradas"}
				</p>
			</div>
			<div className="flex shrink-0 gap-1">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Editar ajuste"
							className="cursor-pointer"
							disabled={pending}
							onClick={onEdit}
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
								confirmation="Excluir este ajuste? O histórico voltará a ser considerado."
								disabled={pending}
								onConfirm={onRemove}
								size="icon-sm"
								variant="outline"
							>
								<LuTrash2 />
							</ConfirmActionButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>Excluir</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
