import { LuCheck, LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditCardImportItem } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardImportItemRow({
	disabled,
	item,
	onApprove,
	onEdit,
	onSelectedChange,
}: {
	disabled: boolean;
	item: CreditCardImportItem;
	onApprove: () => void;
	onEdit: () => void;
	onSelectedChange: (selected: boolean) => void;
}) {
	return (
		<article className="grid grid-cols-[auto_minmax(0,1fr)_auto] items-center gap-3 px-4 py-3">
			<Checkbox
				aria-label={`Selecionar ${item.description}`}
				checked={item.isSelected}
				disabled={disabled}
				onCheckedChange={checked => onSelectedChange(checked === true)}
			/>
			<div className="min-w-0">
				<p className="truncate font-medium text-sm">{item.storeName || item.description}</p>
				{item.storeName ? <p className="truncate text-muted-foreground text-xs">{item.description}</p> : null}
				<p className="mt-1 text-muted-foreground text-xs">
					{formatLocalDate(item.purchaseDate)} · {item.installments > 1 ? `${item.installments}x de ` : ""}
					{currency.format(item.installmentAmount)}
					{item.installments > 1 ? ` · parcela ${item.currentInstallment} nesta fatura` : ""}
				</p>
			</div>
			<div className="flex items-center gap-2">
				<strong className="hidden text-sm sm:block">{currency.format(item.totalAmount)}</strong>
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Editar compra"
							className="cursor-pointer"
							disabled={disabled}
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
						<Button
							aria-label="Aprovar compra"
							className="cursor-pointer"
							disabled={disabled}
							onClick={onApprove}
							size="icon-sm"
						>
							<LuCheck />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Aprovar</TooltipContent>
				</Tooltip>
			</div>
		</article>
	);
}
