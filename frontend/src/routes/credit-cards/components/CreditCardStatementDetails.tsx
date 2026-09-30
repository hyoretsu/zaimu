import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuCalendarCheck, LuCalendarClock, LuCloudDownload, LuReceiptText } from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabsContent } from "@/components/ui/Tabs";
import type { CreditCard, CreditCardStatement, CreditPurchase } from "@/lib/api";
import { getCreditCardStatementDisplayBalance } from "@/lib/credit-card-statement-balance";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreditCardPaymentRow } from "./CreditCardPaymentRow";
import { CreditPurchaseRow } from "./CreditPurchaseRow";
import { getCreditCardStatementStatus } from "./credit-card-statement-status";
import { EditCreditPurchaseDialog } from "./EditCreditPurchaseDialog";
import { RefinanceCreditPurchaseDialog } from "./RefinanceCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "./RefundCreditPurchaseDialog";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardStatementDetails({
	card,
	statement,
	isEmptyCycle = false,
	ignoreBefore,
}: {
	card: CreditCard;
	statement: CreditCardStatement;
	isEmptyCycle?: boolean;
	ignoreBefore: string | null;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
	const [pendingUpdateIds, setPendingUpdateIds] = useState<Set<string>>(new Set());
	const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null);
	const [refinancingPurchase, setRefinancingPurchase] = useState<CreditPurchase | null>(null);
	const [refundingPurchase, setRefundingPurchase] = useState<CreditPurchase | null>(null);
	const detail = useQuery({
		enabled: identity !== null && !isEmptyCycle,
		initialData: isEmptyCycle ? { ...statement, payments: [], purchases: [] } : undefined,
		queryFn: () => dataService.creditCards.getStatement(statement.creditCardId, statement.id),
		queryKey: queryKeys.creditCardStatements.detail(identity!, statement.creditCardId, statement.id),
	});
	const displayedStatement = detail.data ?? statement;
	const displayBalance = getCreditCardStatementDisplayBalance(displayedStatement);
	const invoiceAmount = displayedStatement.amountDue ?? displayedStatement.totalAmount;
	const isIgnored = Boolean(ignoreBefore && statement.statementDate.slice(0, 10) < ignoreBefore);
	const status = isIgnored
		? { className: "text-muted-foreground", icon: LuReceiptText, label: "Desconsiderada" }
		: getCreditCardStatementStatus(displayedStatement);
	const StatusIcon = status.icon;
	const entries = detail.data
		? [
				...detail.data.purchases.map(purchase => ({
					date: purchase.purchaseDate,
					id: purchase.id,
					kind: "purchase" as const,
					purchase,
					time: purchase.time,
				})),
				...detail.data.payments.map(payment => ({
					date: payment.date,
					id: payment.id,
					kind: "payment" as const,
					payment,
					time: payment.time,
				})),
			].toSorted((left, right) =>
				`${right.date.slice(0, 10)}T${right.time ?? ""}`.localeCompare(
					`${left.date.slice(0, 10)}T${left.time ?? ""}`,
				),
			)
		: [];
	const rootId = (id: string | undefined) => {
		const p = detail.data?.purchases.find(p => p.id === id);
		return p?.purchaseId ?? p?.refundOfPurchaseId ?? p?.parentId ?? id;
	};
	const refreshStatement = () => invalidateCacheOperation(queryClient, identity!, "statement");
	const updatePurchase = useMutation({
		mutationFn: ({
			data,
			purchaseId,
		}: {
			data: Parameters<typeof dataService.creditCards.updatePurchase>[2];
			purchaseId: string;
		}) => dataService.creditCards.updatePurchase(statement.creditCardId, purchaseId, data),
		onError: error => {
			showToast(error instanceof Error ? error.message : "Não foi possível editar a transação.", "negative");
		},
		onMutate: ({ purchaseId }) => setPendingUpdateIds(current => new Set(current).add(purchaseId)),
		onSettled: (_data, _error, { purchaseId }) =>
			setPendingUpdateIds(current => {
				const next = new Set(current);
				next.delete(purchaseId);
				return next;
			}),
		onSuccess: async () => {
			await refreshStatement();
			showToast("Transação atualizada.", "positive");
		},
	});
	const deletePurchase = useMutation({
		mutationFn: (purchaseId: string) =>
			dataService.creditCards.deletePurchase(statement.creditCardId, purchaseId),
		onError: error => {
			showToast(error instanceof Error ? error.message : "Não foi possível excluir a transação.", "negative");
		},
		onMutate: id => setPendingDeleteIds(current => new Set(current).add(id)),
		onSettled: (_data, _error, id) =>
			setPendingDeleteIds(current => {
				const next = new Set(current);
				next.delete(id);
				return next;
			}),
		onSuccess: async () => {
			await refreshStatement();
			showToast("Transação excluída.", "positive");
		},
	});
	const refinancePurchase = useMutation({
		mutationFn: ({
			data,
			purchaseId,
		}: {
			data: { feeAmount: number; installments: number; purchaseDate: string };
			purchaseId: string;
		}) => dataService.creditCards.refinancePurchase(statement.creditCardId, purchaseId, data),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível reparcelar a compra.", "negative"),
		onSuccess: async () => {
			setRefinancingPurchase(null);
			await refreshStatement();
			showToast("Compra reparcelada e faturas recalculadas.", "positive");
		},
	});
	const refundPurchase = useMutation({
		mutationFn: ({
			data,
			purchase,
		}: {
			data: { amount?: number; date?: string; policy?: "KEEP_INSTALLMENTS" | "CANCEL_FUTURE_INSTALLMENTS" };
			purchase: CreditPurchase;
		}) => {
			const purchaseId = purchase.purchaseId ?? purchase.refundOfPurchaseId ?? purchase.id;
			return purchase.isRefund
				? dataService.creditCards.updateRefund(statement.creditCardId, purchaseId, purchase.id, {
						amount: data.amount ?? Math.abs(purchase.totalAmount),
						date: data.date ?? purchase.purchaseDate.slice(0, 10),
					})
				: dataService.creditCards.refundPurchase(statement.creditCardId, purchaseId, data);
		},
		onError: error =>
			showToast(
				error instanceof Error ? error.message : "Não foi possível registrar o reembolso.",
				"negative",
			),
		onSuccess: async () => {
			setRefundingPurchase(null);
			await refreshStatement();
			showToast("Reembolso registrado e faturas recalculadas.", "positive");
		},
	});
	const deleteRefund = useMutation({
		mutationFn: (refundId: string) =>
			dataService.creditCards.deletePurchase(statement.creditCardId, refundId),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível excluir o reembolso.", "negative"),
		onSuccess: async () => {
			setRefundingPurchase(null);
			await refreshStatement();
			showToast("Reembolso excluído e faturas recalculadas.", "positive");
		},
	});
	const pendingRootIds = new Set([
		...[...pendingDeleteIds].map(rootId),
		...[...pendingUpdateIds].map(rootId),
		...(refinancePurchase.isPending ? [rootId(refinancePurchase.variables?.purchaseId)] : []),
		...(refundPurchase.isPending ? [rootId(refundPurchase.variables?.purchase.id)] : []),
		...(deleteRefund.isPending ? [rootId(deleteRefund.variables)] : []),
	]);
	const rowPending = (p: CreditPurchase) =>
		pendingRootIds.has(p.purchaseId ?? p.refundOfPurchaseId ?? p.parentId ?? p.id);
	return (
		<TabsContent className="min-h-0 min-w-0 overflow-hidden sm:pl-6" value={statement.id}>
			<ScrollArea className="h-full min-h-0 pr-3">
				<div className="grid gap-3">
					<header className="grid gap-3 rounded-xl border bg-muted/30 p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h3 className="font-bold text-base sm:text-lg" id={`statement-title-${statement.id}`}>
								{formatLocalDate(statement.dueDate, { month: "long", year: "numeric" }).replace(
									/^./,
									letter => letter.toLocaleUpperCase("pt-BR"),
								)}
							</h3>
							<div className="flex flex-wrap gap-2">
								{statement.isFullySynced && (
									<AppBadge variant="outline">
										<LuCloudDownload aria-hidden="true" className="text-emerald-600" />
										<span>Sincronizada</span>
									</AppBadge>
								)}
								<AppBadge className="shrink-0" variant="outline">
									<StatusIcon aria-hidden="true" className={status.className} />
									{status.label}
								</AppBadge>
							</div>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Valor da fatura</p>
							<strong className="block text-2xl tabular-nums">{currency.format(invoiceAmount)}</strong>
							{!isIgnored && Math.abs(invoiceAmount - displayBalance) > 0.001 && (
								<p className="mt-1 text-muted-foreground text-sm">
									{displayBalance < 0 ? "Crédito" : "Restante a pagar"}:{" "}
									{currency.format(Math.abs(displayBalance))}
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-2 border-t pt-2">
							<div className="min-w-0">
								<p className="flex items-center gap-1 text-muted-foreground text-xs">
									<LuCalendarCheck /> Fechamento
								</p>
								<strong className="mt-0.5 block text-sm">{formatLocalDate(statement.statementDate)}</strong>
							</div>
							<div className="min-w-0 border-l pl-2">
								<p className="flex items-center gap-1 text-muted-foreground text-xs">
									<LuCalendarClock /> Vencimento
								</p>
								<strong className="mt-0.5 block text-sm">{formatLocalDate(statement.dueDate)}</strong>
							</div>
						</div>
					</header>
					<div className="grid gap-3">
						<div className="flex items-center justify-between gap-3">
							<h4 className="font-semibold">Transações</h4>
							{detail.data && (
								<span className="text-muted-foreground text-xs">
									{entries.length} {entries.length === 1 ? "transação" : "transações"}
								</span>
							)}
						</div>
						{detail.isPending ? (
							<div className="grid gap-2">
								{[1, 2, 3, 4].map(item => (
									<Skeleton className="h-16" key={item} />
								))}
							</div>
						) : detail.isError ? (
							<EmptyState
								description="Tente selecionar a fatura novamente."
								icon={<LuReceiptText className="size-7" />}
								title="Não foi possível carregar as transações"
							/>
						) : entries.length ? (
							<div className="grid gap-2">
								{entries.map(entry =>
									entry.kind === "payment" ? (
										<CreditCardPaymentRow key={entry.id} payment={entry.payment} />
									) : (
										<CreditPurchaseRow
											deleteDisabled={
												entry.purchase.isSynced === true ||
												statement.isForecast === true ||
												rowPending(entry.purchase)
											}
											editDisabled={statement.isForecast === true || rowPending(entry.purchase)}
											key={entry.id}
											onDelete={() => deletePurchase.mutateAsync(entry.purchase.id)}
											onEdit={() =>
												entry.purchase.isRefund
													? setRefundingPurchase(entry.purchase)
													: setEditingPurchase(entry.purchase)
											}
											onEditRefund={refund =>
												setRefundingPurchase({
													...entry.purchase,
													id: refund.id,
													installmentAmount: -refund.creditAmount,
													isRefund: true,
													purchaseDate: refund.date,
													purchaseId: entry.purchase.purchaseId ?? entry.purchase.id,
													refund,
													totalAmount: -refund.amount,
												})
											}
											onRefinance={() => setRefinancingPurchase(entry.purchase)}
											onRefund={() => setRefundingPurchase(entry.purchase)}
											purchase={entry.purchase}
											refinanceDisabled={
												statement.isForecast === true ||
												rowPending(entry.purchase) ||
												entry.purchase.isStatementCharge === true ||
												entry.purchase.isSettled === true
											}
											refundDisabled={statement.isForecast === true || rowPending(entry.purchase)}
										/>
									),
								)}
							</div>
						) : (
							<EmptyState
								description="Nenhuma transação foi vinculada a esta fatura."
								icon={<LuReceiptText className="size-7" />}
								title="Fatura sem transações"
							/>
						)}
					</div>
				</div>
			</ScrollArea>
			{editingPurchase && (
				<EditCreditPurchaseDialog
					currentCard={card}
					key={editingPurchase.id}
					onOpenChange={open => !open && setEditingPurchase(null)}
					onSubmit={async data => {
						await updatePurchase.mutateAsync({ data, purchaseId: editingPurchase.id });
					}}
					open
					pending={pendingUpdateIds.has(editingPurchase.id)}
					purchase={editingPurchase}
				/>
			)}
			{refinancingPurchase && (
				<RefinanceCreditPurchaseDialog
					onOpenChange={open => !open && setRefinancingPurchase(null)}
					onSubmit={async data => {
						await refinancePurchase.mutateAsync({ data, purchaseId: refinancingPurchase.id });
					}}
					open
					pending={refinancePurchase.isPending}
					purchase={refinancingPurchase}
				/>
			)}
			{refundingPurchase && (
				<RefundCreditPurchaseDialog
					onDelete={
						refundingPurchase.isRefund
							? async () => {
									await deleteRefund.mutateAsync(refundingPurchase.id);
								}
							: undefined
					}
					onOpenChange={open => !open && setRefundingPurchase(null)}
					onSubmit={async data => {
						await refundPurchase.mutateAsync({ data, purchase: refundingPurchase });
					}}
					open
					pending={refundPurchase.isPending || deleteRefund.isPending}
					purchase={refundingPurchase}
					refundId={refundingPurchase.isRefund ? refundingPurchase.id : undefined}
				/>
			)}
		</TabsContent>
	);
}
