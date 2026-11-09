import { LuCloudDownload, LuPencil, LuTrash2, LuTrendingUp } from "react-icons/lu";
import { ListItemLayout } from "@/components/ui/ListItemLayout";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { formatLocalTime } from "@/lib/date";
import { createCurrencyFormatter } from "@/lib/format-currency";
import { ItemActions } from "./TransactionListItem/ItemActions";

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
	const formattedTime = formatLocalTime(time);

	return (
		<ListItemLayout
			actions={
				<ItemActions
					actions={[
						{
							ariaLabel: "Editar rendimento",
							disabled: deleting,
							icon: <LuPencil />,
							onClick: onEdit,
							text: "Editar",
						},
						{
							ariaLabel: "Excluir rendimento",
							color: "destructive",
							confirmation: "Excluir rendimento permanentemente?",
							confirmIcon: <LuTrash2 />,
							disabled: deleting,
							icon: <LuTrash2 />,
							onConfirm: onDelete,
							text: "Excluir",
						},
					]}
				/>
			}
			amount={
				<p className="font-bold whitespace-nowrap text-emerald-600">
					{amount > 0 ? "+" : ""}
					{createCurrencyFormatter(currencyCode).format(amount)}
				</p>
			}
			icon={
				<div className="bg-muted flex size-11 shrink-0 items-center justify-center rounded-2xl text-emerald-600">
					<LuTrendingUp aria-hidden="true" />
				</div>
			}
			metadata={
				<div className="min-w-0 space-y-3">
					{formattedTime ? (
						<div>
							<span className="text-muted-foreground text-xs">{formattedTime}</span>
						</div>
					) : null}
					{accountName ? (
						<p className="text-muted-foreground truncate text-xs">{accountName}</p>
					) : null}
				</div>
			}
			title={
				<div className="flex min-w-0 items-center gap-1.5">
					<p className="min-w-0 truncate leading-6 font-semibold">Rendimento</p>
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
			}
		/>
	);
}
