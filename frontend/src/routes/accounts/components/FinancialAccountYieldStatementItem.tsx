import { LuPencil, LuTrash2, LuTrendingUp } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function FinancialAccountYieldStatementItem({
	amount,
	deleting = false,
	onDelete,
	onEdit,
}: {
	amount: number;
	deleting?: boolean;
	onDelete: () => void | Promise<void>;
	onEdit: () => void;
}) {
	return (
		<div className="grid grid-cols-[auto_minmax(0,1fr)] gap-x-3 gap-y-2 px-4 py-3 sm:flex sm:items-center">
			<span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600">
				<LuTrendingUp />
			</span>
			<div className="flex min-w-0 flex-wrap items-center justify-between gap-x-3 gap-y-1 sm:contents">
				<p className="min-w-0 flex-1 font-semibold">Rendimento</p>
				<p className="whitespace-nowrap font-bold text-emerald-600">
					{amount > 0 ? "+" : ""}
					{currency.format(amount)}
				</p>
			</div>
			<div className="col-start-2 flex justify-end gap-2 sm:contents">
				<Tooltip>
					<TooltipTrigger asChild>
						<Button
							aria-label="Editar rendimento"
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={deleting}
							onClick={onEdit}
							size="icon"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</TooltipTrigger>
					<TooltipContent>Editar rendimento</TooltipContent>
				</Tooltip>
				<Tooltip>
					<TooltipTrigger asChild>
						<span>
							<ConfirmActionButton
								aria-label="Excluir rendimento"
								className="cursor-pointer text-destructive hover:text-destructive disabled:cursor-not-allowed"
								confirmation="Excluir rendimento permanentemente?"
								disabled={deleting}
								onConfirm={onDelete}
								size="icon"
								variant="outline"
							>
								<LuTrash2 />
							</ConfirmActionButton>
						</span>
					</TooltipTrigger>
					<TooltipContent>Excluir rendimento</TooltipContent>
				</Tooltip>
			</div>
		</div>
	);
}
