import { useQuery } from "@tanstack/react-query";
import { creditBookEffects } from "@zaimu/finance/credit-book";
import { currencyScale } from "@zaimu/finance/money";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { CreditPurchase } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate, getLocalDateKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function ManageCreditPurchaseRefundsDialog({
	purchase,
	open,
	onOpenChange,
	onAdd,
	onEdit,
	onDelete,
	pendingRefundIds,
}: {
	purchase: CreditPurchase;
	open: boolean;
	onOpenChange: (open: boolean) => void;
	onAdd: () => void;
	onEdit: (refund: NonNullable<CreditPurchase["refunds"]>[number]) => void;
	onDelete: (refundId: string) => Promise<void>;
	pendingRefundIds: Set<string>;
}) {
	const purchaseName = purchase.description.trim() || purchase.storeName?.trim();
	const identity = useCacheIdentity();
	const cardId = purchase.creditCardId;
	const bookQuery = useQuery({
		enabled: open && Boolean(cardId) && Boolean(identity),
		queryFn: () => dataService.creditCards.getBook(cardId!),
		queryKey: queryKeys.creditCards.book(identity!, cardId!),
	});
	const purchaseId = purchase.purchaseId ?? purchase.refundOfPurchaseId ?? purchase.id;
	const book = bookQuery.data;
	const currencyCode = book?.card.currency ?? purchase.bookingCurrency ?? "BRL";
	const currency = new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" });
	const scale = currencyScale(currencyCode);
	const effects = new Map(
		(book ? creditBookEffects(book, getLocalDateKey()) : []).map(effect => [effect.refundId, effect]),
	);
	const refunds = (book?.refunds ?? [])
		.filter(refund => refund.purchaseId === purchaseId && !refund.deletedAt)
		.map(refund => ({
			amount: refund.amountCents / scale,
			canceledAmount: (effects.get(refund.id)?.canceledAmountCents ?? 0) / scale,
			creditAmount: (effects.get(refund.id)?.creditAmountCents ?? 0) / scale,
			date: refund.creditDate,
			id: refund.id,
			policy: refund.policy,
		}));
	const totalAmount = book?.purchases.find(item => item.id === purchaseId)?.totalAmountCents ?? 0;
	const remainingAmount =
		totalAmount - refunds.reduce((sum, refund) => sum + Math.round(refund.amount * scale), 0);
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Gerenciar reembolsos</DialogTitle>
					<DialogDescription>
						{purchaseName ? `Reembolsos de ${purchaseName}.` : "Reembolsos desta compra."} Edite, exclua ou
						registre um novo reembolso.
					</DialogDescription>
				</DialogHeader>
				<ScrollArea className="h-[min(50dvh,24rem)] min-h-0">
					<div className="space-y-3 pr-3">
						{bookQuery.isPending ? (
							[0, 1, 2].map(key => <Skeleton className="h-24 rounded-xl" key={key} />)
						) : bookQuery.isError ? (
							<div className="space-y-3">
								<p className="text-destructive text-sm">Não foi possível carregar os reembolsos.</p>
								<ActionGroup>
									<Button onClick={() => void bookQuery.refetch()} variant="outline">
										Tentar novamente
									</Button>
								</ActionGroup>
							</div>
						) : refunds.length === 0 ? (
							<p className="text-muted-foreground text-sm">Nenhum reembolso registrado para esta compra.</p>
						) : (
							refunds.map(refund => (
								<div
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-3"
									key={refund.id}
								>
									<div className="space-y-1 text-sm">
										<p className="font-medium">{currency.format(refund.amount)}</p>
										<p className="text-muted-foreground">{formatLocalDate(refund.date)}</p>
										<p className="text-muted-foreground text-xs">
											Crédito {currency.format(refund.creditAmount)}
											{refund.canceledAmount > 0
												? ` - parcelas canceladas ${currency.format(refund.canceledAmount)}`
												: ""}
										</p>
									</div>
									<ActionGroup className="ml-auto">
										<Tooltip>
											<TooltipTrigger asChild>
												<Button
													aria-label="Editar reembolso"
													disabled={pendingRefundIds.has(refund.id)}
													onClick={() => onEdit(refund)}
													size="icon-sm"
													variant="outline"
												>
													<LuPencil />
												</Button>
											</TooltipTrigger>
											<TooltipContent>Editar reembolso</TooltipContent>
										</Tooltip>
										<Tooltip>
											<TooltipTrigger asChild>
												<ConfirmActionButton
													aria-label="Excluir reembolso"
													confirmation="Excluir este reembolso permanentemente?"
													disabled={pendingRefundIds.has(refund.id)}
													onConfirm={() => onDelete(refund.id)}
													size="icon-sm"
													variant="destructive"
												>
													<LuTrash2 />
												</ConfirmActionButton>
											</TooltipTrigger>
											<TooltipContent>Excluir reembolso</TooltipContent>
										</Tooltip>
									</ActionGroup>
								</div>
							))
						)}
					</div>
				</ScrollArea>
				<DialogFooter>
					<Button onClick={() => onOpenChange(false)} variant="outline">
						Fechar
					</Button>
					<Button
						disabled={
							bookQuery.isPending || bookQuery.isError || remainingAmount <= 0 || pendingRefundIds.size > 0
						}
						onClick={onAdd}
					>
						<LuPlus />
						Adicionar reembolso
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
