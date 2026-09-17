import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuCalendarCheck,
	LuCalendarClock,
	LuCircleCheck,
	LuClock3,
	LuCloudDownload,
	LuReceiptText,
} from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import { EmptyState } from "@/components/ui/EmptyState";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabsContent } from "@/components/ui/Tabs";
import type { CreditCardStatement, CreditPurchase } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreditCardPaymentRow } from "./CreditCardPaymentRow";
import { CreditPurchaseRow } from "./CreditPurchaseRow";
import { EditCreditPurchaseDialog } from "./EditCreditPurchaseDialog";
import { RefinanceCreditPurchaseDialog } from "./RefinanceCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "./RefundCreditPurchaseDialog";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardStatementDetails({ statement }: { statement: CreditCardStatement }) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null);
	const [refinancingPurchase, setRefinancingPurchase] = useState<CreditPurchase | null>(null);
	const [refundingPurchase, setRefundingPurchase] = useState<CreditPurchase | null>(null);
	const detail = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getStatement(statement.creditCardId, statement.id),
		queryKey: queryKeys.creditCardStatements.detail(identity!, statement.creditCardId, statement.id),
	});
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
		onSuccess: async () => {
			setEditingPurchase(null);
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
		mutationFn: ({ data, purchaseId }: { data: { amount?: number; date?: string }; purchaseId: string }) =>
			dataService.creditCards.refundPurchase(statement.creditCardId, purchaseId, data),
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
	return (
		<TabsContent
			className="grid min-h-0 min-w-0 grid-rows-[auto_minmax(0,1fr)] gap-3 overflow-hidden pt-4 sm:pt-0 sm:pl-6"
			value={statement.id}
		>
			<header className="grid gap-2 rounded-xl border bg-muted/30 p-3">
				<div className="flex flex-wrap items-baseline justify-between gap-x-2 gap-y-1">
					<p className="text-muted-foreground text-xs uppercase tracking-wide">Mês de referência</p>
					<h3 className="font-bold text-base sm:text-lg" id={`statement-title-${statement.id}`}>
						{formatLocalDate(statement.statementDate, { month: "long", year: "numeric" })}
					</h3>
				</div>
				<div className="grid gap-2 border-t pt-2 sm:grid-cols-[minmax(0,1fr)_auto] sm:items-center sm:gap-3">
					<div>
						<p className="text-muted-foreground text-xs">Saldo da fatura</p>
						<strong className="text-base sm:text-lg">{currency.format(statement.balanceAmount)}</strong>
					</div>
					<div className="flex flex-wrap gap-2 sm:justify-end">
						{statement.isFullySynced && (
							<AppBadge variant="outline">
								<LuCloudDownload aria-hidden="true" className="text-emerald-600" />
								<span>Sincronizada</span>
							</AppBadge>
						)}
						<AppBadge className="shrink-0" variant={statement.isPaid ? "secondary" : "outline"}>
							{statement.isPaid ? <LuCircleCheck /> : <LuClock3 />}
							{statement.isPaid ? "Paga" : "Em aberto"}
						</AppBadge>
					</div>
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
			<div className="grid min-h-0 grid-rows-[auto_minmax(0,1fr)] gap-3">
				<div className="flex items-center justify-between gap-3">
					<h4 className="font-semibold">Transações</h4>
					{detail.data && (
						<span className="text-muted-foreground text-xs">
							{entries.length} {entries.length === 1 ? "transação" : "transações"}
						</span>
					)}
				</div>
				<ScrollArea className="min-h-0 pr-3">
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
										disabled={statement.isPaid || statement.isForecast === true || deletePurchase.isPending}
										key={entry.id}
										onDelete={() => deletePurchase.mutateAsync(entry.purchase.id)}
										onEdit={() => setEditingPurchase(entry.purchase)}
										onRefinance={() => setRefinancingPurchase(entry.purchase)}
										onRefund={() => setRefundingPurchase(entry.purchase)}
										purchase={entry.purchase}
										refinanceDisabled={
											statement.isForecast === true ||
											refinancePurchase.isPending ||
											entry.purchase.isSettled === true
										}
										refundDisabled={statement.isForecast === true || refundPurchase.isPending}
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
				</ScrollArea>
			</div>
			{editingPurchase && (
				<EditCreditPurchaseDialog
					key={editingPurchase.id}
					onOpenChange={open => !open && setEditingPurchase(null)}
					onSubmit={async data => {
						await updatePurchase.mutateAsync({ data, purchaseId: editingPurchase.id });
					}}
					open
					pending={updatePurchase.isPending}
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
					onOpenChange={open => !open && setRefundingPurchase(null)}
					onSubmit={async data => {
						await refundPurchase.mutateAsync({ data, purchaseId: refundingPurchase.id });
					}}
					open
					pending={refundPurchase.isPending}
					purchase={refundingPurchase}
				/>
			)}
		</TabsContent>
	);
}
