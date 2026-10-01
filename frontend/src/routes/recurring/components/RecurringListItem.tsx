import { HiArrowDown, HiArrowUp, HiCheck, HiPause, HiPencil, HiPlay, HiTrash } from "react-icons/hi2";
import { TransactionListItem } from "@/components/transactions";
import type { ItemAction } from "@/components/transactions/TransactionListItem/ItemActions";
import { AppBadge } from "@/components/ui/AppBadge";
import type { Transaction } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";
import { frequencyLabels, paymentMethodLabels, sourceLabels } from "./constants";
import { isRecurrenceEnded } from "./recurrence-dates";
import { getRecurrenceScheduleSummary } from "./recurrence-schedule";
import type { RecurringListItemData } from "./types";
import { movementLabels, scheduleLabel } from "./unified-types";

export function RecurringListItem({
	deleting,
	item,
	onDelete,
	onEdit,
	onToggle,
	toggling,
}: {
	deleting: boolean;
	item: RecurringListItemData;
	onDelete: () => void;
	onEdit: () => void;
	onToggle: () => void;
	toggling: boolean;
}) {
	const isIncome = item.direction === "INCOME";
	const hasEnded = isRecurrenceEnded(item.endDate);
	const paymentMethod = item.paymentMethod ? paymentMethodLabels[item.paymentMethod] : undefined;
	const scheduleSummary = getRecurrenceScheduleSummary(
		item.frequency,
		item.startDate,
		item.day,
		item.dayOfWeek,
	);
	const actionItems: ItemAction[] = [
		{
			ariaLabel: "Editar recorrência",
			disabled: toggling || deleting,
			icon: <HiPencil />,
			onClick: onEdit,
			text: "Editar",
		},
		...(!hasEnded
			? [
					{
						ariaLabel: item.active ? "Pausar recorrência" : "Retomar recorrência",
						disabled: toggling || deleting,
						icon: item.active ? <HiPause /> : <HiPlay />,
						onClick: onToggle,
						text: item.active ? "Pausar" : "Retomar",
					},
				]
			: []),
		{
			ariaLabel: "Excluir recorrência",
			color: "destructive",
			confirmation: `Excluir ${item.title} permanentemente?`,
			confirmIcon: <HiCheck />,
			disabled: toggling || deleting,
			icon: <HiTrash />,
			onConfirm: onDelete,
			text: "Excluir",
		},
	];
	const transaction: Transaction = {
		amount: item.amount,
		createdAt: item.startDate,
		date: item.startDate,
		id: item.id,
		...(item.direction === "INCOME"
			? {
					destinationAccountType: item.accountType,
					destinationFinancialAccountId: item.financialAccountId,
					destinationName: item.accountName,
				}
			: {
					originAccountType: item.accountType,
					originFinancialAccountId: item.financialAccountId,
					originName: item.accountName,
				}),
		...(item.direction === "TRANSFER" && {
			destinationAccountType: item.destinationAccountType,
			destinationFinancialAccountId: item.recurrence?.destinationFinancialAccountId ?? undefined,
			destinationName: item.destinationName,
		}),
		storeName: item.storeName,
		tags: item.tags,
		type: item.direction,
	};

	return (
		<TransactionListItem
			actionItems={actionItems}
			amount={
				<p
					className={`whitespace-nowrap font-bold ${isIncome ? "text-emerald-600" : item.direction === "TRANSFER" ? "text-primary" : "text-rose-600"}`}
				>
					{isIncome ? "+" : item.direction === "TRANSFER" ? "" : "-"}
					{new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" }).format(item.amount)}
				</p>
			}
			className={item.active ? undefined : "opacity-60"}
			deleting={deleting || toggling}
			icon={
				<div
					className={`flex size-11 shrink-0 items-center justify-center rounded-2xl ${
						isIncome
							? "bg-emerald-500/10 text-emerald-600"
							: item.direction === "TRANSFER"
								? "bg-primary/10 text-primary"
								: "bg-rose-500/10 text-rose-600"
					}`}
				>
					{isIncome ? <HiArrowDown aria-hidden="true" /> : <HiArrowUp aria-hidden="true" />}
				</div>
			}
			metadataPrefix={
				<span className="text-muted-foreground text-xs">
					{item.recurrence
						? scheduleLabel(item.recurrence.unit, item.recurrence.interval)
						: frequencyLabels[item.frequency]}
					{scheduleSummary ? ` · ${scheduleSummary}` : ""}
					{paymentMethod ? ` · ${paymentMethod}` : ""}
					{item.startDate ? ` · inicia ${formatLocalDate(item.startDate)}` : ""}
					{item.endDate ? ` · até ${formatLocalDate(item.endDate)}` : ""}
				</span>
			}
			showAccountBadge={Boolean(item.accountName)}
			title={
				<div className="flex min-w-0 flex-wrap items-center gap-2">
					<p className="w-fit max-w-full shrink-0 truncate font-semibold leading-6">{item.title}</p>
					<AppBadge variant="outline">
						{item.recurrence ? movementLabels[item.recurrence.movement] : sourceLabels[item.source]}
					</AppBadge>
					{item.recurrence?.needsConfiguration && (
						<AppBadge variant="destructive">Configuração pendente</AppBadge>
					)}
					{item.direction === "TRANSFER" && (
						<span className="text-muted-foreground text-xs">Entre contas próprias</span>
					)}
					{!item.active && <AppBadge variant="secondary">Pausada</AppBadge>}
					{hasEnded && <AppBadge variant="secondary">Encerrada</AppBadge>}
				</div>
			}
			transaction={transaction}
		/>
	);
}
