import { LuCloudDownload, LuPencil, LuTrash2, LuTrendingUp } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { formatLocalTime } from "@/lib/date";

export function FinancialAccountYieldStatementItem({
	currencyCode = "BRL",
	accountName,
	amount,
	deleting = false,
	isSynced = false,
	time,
	onDelete,
	onEdit,
}: {
	currencyCode?: string;
	accountName?: string;
	amount: number;
	deleting?: boolean;
	isSynced?: boolean;
	time?: string | null;
	onDelete: () => void | Promise<void>;
	onEdit: () => void;
}) {
	return (
		<div className="flex min-w-0 items-center gap-3 px-4 py-3">
			<span className="flex size-9 shrink-0 items-center justify-center rounded-2xl bg-emerald-500/10 text-emerald-600 sm:size-11">
				<LuTrendingUp />
			</span>
			<div className="min-w-0 flex-1 space-y-1">
				<div className="flex min-w-0 items-center gap-1.5">
					<p className="truncate text-sm font-semibold sm:text-base">Rendimento</p>
					{isSynced ? (
						<Tooltip>
							<TooltipTrigger asChild>
								<span
									aria-label="Sincronizado"
									className="shrink-0 text-emerald-600"
									role="img"
								>
									<LuCloudDownload aria-hidden="true" className="size-4" />
								</span>
							</TooltipTrigger>
							<TooltipContent>Sincronizado</TooltipContent>
						</Tooltip>
					) : null}
				</div>
				{accountName ? <p className="text-muted-foreground truncate text-xs">{accountName}</p> : null}
				{formatLocalTime(time) ? (
					<p className="text-muted-foreground text-xs">{formatLocalTime(time)}</p>
				) : null}
			</div>
			<div className="flex shrink-0 flex-col items-end gap-2 sm:flex-row sm:items-center sm:gap-4">
				<p className="font-bold whitespace-nowrap text-emerald-600">
					{amount > 0 ? "+" : ""}
					{new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(
						amount,
					)}
				</p>
				<ActionGroup className="flex-nowrap">
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
									className="text-destructive hover:text-destructive cursor-pointer disabled:cursor-not-allowed"
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
				</ActionGroup>
			</div>
		</div>
	);
}
