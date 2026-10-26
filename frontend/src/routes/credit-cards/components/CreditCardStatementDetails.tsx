import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import {
	LuCalendarCheck,
	LuCalendarClock,
	LuCloudDownload,
	LuFileUp,
	LuPencil,
	LuPlus,
	LuReceiptText,
} from "react-icons/lu";
import {
	CreditCardImportReviewDialog,
	ImportCreditCardStatementDialog,
} from "@/components/credit-card-imports";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import { CollapsibleListingSection } from "@/components/ui/CollapsibleListingSection";
import { DialogBody } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { FloatingActionMenu } from "@/components/ui/FloatingActionMenu";
import { Skeleton } from "@/components/ui/Skeleton";
import { TabsContent } from "@/components/ui/Tabs";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { CreditCard, CreditCardStatement, CreditPurchase } from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { getCreditCardStatementDisplayAmounts } from "@/lib/credit-card-statement-balance";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { isVisibleStatementPurchase } from "./credit-card-statement-purchases";
import { getCreditCardStatementStatus } from "./credit-card-statement-status";
import { CreditCardPaymentRow } from "./CreditCardPaymentRow";
import { CreditPurchaseEditScopeDialog } from "./CreditPurchaseEditScopeDialog";
import { CreditPurchaseRow } from "./CreditPurchaseRow";
import { EditCreditCardStatementDialog } from "./EditCreditCardStatementDialog";
import { EditCreditPurchaseDialog } from "./EditCreditPurchaseDialog";
import { ManageCreditPurchaseRefundsDialog } from "./ManageCreditPurchaseRefundsDialog";
import { RefinanceCreditPurchaseDialog } from "./RefinanceCreditPurchaseDialog";
import { RefundCreditPurchaseDialog } from "./RefundCreditPurchaseDialog";
import type { StatementActionRecovery } from "./statement-action-recovery";

export function CreditCardStatementDetails({
	card,
	statement,
	isEmptyCycle = false,
	ignoreBefore,
	onAddPurchase,
}: {
	card: CreditCard;
	statement: CreditCardStatement;
	isEmptyCycle?: boolean;
	ignoreBefore: string | null;
	onAddPurchase: () => void;
}) {
	const currencyCode = card.currency ?? "BRL";
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [editingStatement, setEditingStatement] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [pendingDeleteIds, setPendingDeleteIds] = useState<Set<string>>(new Set());
	const [pendingUpdateIds, setPendingUpdateIds] = useState<Set<string>>(new Set());
	const [choosingEditScope, setChoosingEditScope] = useState<CreditPurchase | null>(null);
	const [editingPurchase, setEditingPurchase] = useState<CreditPurchase | null>(null);
	const [refinancingPurchase, setRefinancingPurchase] = useState<CreditPurchase | null>(null);
	const [managingRefunds, setManagingRefunds] = useState<CreditPurchase | null>(null);
	const [refundingPurchase, setRefundingPurchase] = useState<CreditPurchase | null>(null);
	const [recoveredAction, setRecoveredAction] = useState<StatementActionRecovery | null>(null);
	useBackgroundModalRecovery<StatementActionRecovery>(`credit-statement-action:${statement.id}`, entry => {
		setRecoveredAction(entry.payload);
		if (entry.payload.action === "dates") setEditingStatement(true);
		if (entry.payload.action === "refinance") setRefinancingPurchase(entry.payload.purchase ?? null);
		if (entry.payload.action === "refund" || entry.payload.action === "delete-refund")
			setRefundingPurchase(entry.payload.purchase ?? null);
	});
	const backgroundPending = useModalRecoveryStore(state => state.pending);

	const detail = useQuery({
		enabled: identity !== null && !isEmptyCycle,
		initialData: isEmptyCycle ? { ...statement, payments: [], purchases: [] } : undefined,
		queryFn: () => dataService.creditCards.getStatement(statement.creditCardId, statement.id),
		queryKey: queryKeys.creditCardStatements.detail(identity!, statement.creditCardId, statement.id),
	});
	const displayedStatement = detail.data ?? statement;
	// The listing replays actual and projected books; detail only replays the projected book.
	const { invoiceAmount, projectedAmount, remainingAmount } =
		getCreditCardStatementDisplayAmounts(statement);
	const forecasts =
		detail.data?.purchases.filter(
			purchase => purchase.isForecast && isVisibleStatementPurchase(purchase),
		) ?? [];
	const isIgnored = Boolean(ignoreBefore && statement.statementDate.slice(0, 10) < ignoreBefore);
	const status = isIgnored
		? { className: "text-muted-foreground", icon: LuReceiptText, label: "Desconsiderada" }
		: getCreditCardStatementStatus(displayedStatement);
	const StatusIcon = status.icon;
	const entries = detail.data
		? [
				...detail.data.purchases
					.filter(purchase => !purchase.isForecast && isVisibleStatementPurchase(purchase))
					.map(purchase => ({
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
	const updatePurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: ({
			data,
			purchaseId,
		}: {
			data: Parameters<typeof dataService.creditCards.updatePurchase>[2];
			purchaseId: string;
		}) => dataService.creditCards.updatePurchase(statement.creditCardId, purchaseId, data),
		onError: error => {
			showToast(
				error instanceof Error ? error.message : "Não foi possível editar a transação.",
				"negative",
			);
		},
		onMutate: ({ purchaseId }) => setPendingUpdateIds(current => new Set(current).add(purchaseId)),
		onSettled: (_data, _error, { purchaseId }) =>
			setPendingUpdateIds(current => {
				const next = new Set(current);
				next.delete(purchaseId);
				return next;
			}),
		onSuccess: async () => {
			showToast("Transação atualizada.", "positive");
		},
	});
	const deletePurchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: (purchaseId: string) =>
			dataService.creditCards.deletePurchase(statement.creditCardId, purchaseId),
		onError: error => {
			showToast(
				error instanceof Error ? error.message : "Não foi possível excluir a transação.",
				"negative",
			);
		},
		onMutate: id => setPendingDeleteIds(current => new Set(current).add(id)),
		onSettled: (_data, _error, id) =>
			setPendingDeleteIds(current => {
				const next = new Set(current);
				next.delete(id);
				return next;
			}),
		onSuccess: async () => {
			showToast("Transação excluída.", "positive");
		},
	});
	const backgroundAction = (
		payload: StatementActionRecovery,
		close: () => void,
		run: () => Promise<unknown>,
		deleting = false,
	) => {
		const purchase = payload.purchase!;
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["statement"] },
			close: () => {
				setRecoveredAction(null);
				close();
			},
			conflictKey: `credit-purchase:${purchase.purchaseId ?? purchase.refundOfPurchaseId ?? purchase.id}`,
			failureMessage: "Não foi possível concluir a operação.",
			loadingMessage: deleting ? "Excluindo reembolso..." : "Salvando compra...",
			recovery: { entityId: purchase.id, kind: `credit-statement-action:${statement.id}`, payload },
			run,
			successMessage: deleting ? "Reembolso excluído." : "Compra atualizada e faturas recalculadas.",
		});
	};
	const deleteRefund = async (purchase: CreditPurchase) =>
		backgroundAction(
			{ action: "delete-refund", cardId: card.id, purchase, statement },
			() => {
				if (refundingPurchase) setRefundingPurchase(null);
				else setManagingRefunds(null);
			},
			() => dataService.creditCards.deletePurchase(card.id, purchase.id),
			true,
		);
	const pendingRootIds = new Set([
		...[...pendingDeleteIds].map(rootId),
		...[...pendingUpdateIds].map(rootId),
		...Object.keys(backgroundPending)
			.filter(key => key.startsWith(`${identity}:credit-purchase:`))
			.map(key => key.slice(`${identity}:credit-purchase:`.length)),
	]);
	const pendingFamilyIds = new Set(
		entries.flatMap(entry => {
			if (entry.kind === "payment") return [];
			const p = entry.purchase;
			const purchaseId = p.purchaseId ?? p.refundOfPurchaseId ?? p.parentId ?? p.id;
			return pendingRootIds.has(purchaseId) ? [p.refinancingOriginalPurchaseId ?? purchaseId] : [];
		}),
	);
	const rowPending = (p: CreditPurchase) => {
		const purchaseId = p.purchaseId ?? p.refundOfPurchaseId ?? p.parentId ?? p.id;
		return (
			pendingRootIds.has(purchaseId) ||
			pendingFamilyIds.has(p.refinancingOriginalPurchaseId ?? purchaseId)
		);
	};
	return (
		<TabsContent className="relative flex min-h-0 min-w-0 flex-col overflow-hidden" value={statement.id}>
			<DialogBody className="flex-1">
				<div className="grid gap-3 pr-3 pb-24">
					<header className="bg-muted/30 grid gap-3 rounded-xl border p-4">
						<div className="flex flex-wrap items-center justify-between gap-2">
							<h3
								className="text-base font-bold sm:text-lg"
								id={`statement-title-${statement.id}`}
							>
								{formatLocalDate(displayedStatement.dueDate, {
									month: "long",
									year: "numeric",
								}).replace(/^./, letter => letter.toLocaleUpperCase("pt-BR"))}
							</h3>
							<div className="flex flex-wrap gap-2">
								{statement.isFullySynced && (
									<AppBadge variant="outline">
										<LuCloudDownload aria-hidden="true" className="text-emerald-600" />
										<span>Sincronizada</span>
									</AppBadge>
								)}
								{status.label && (
									<AppBadge className="shrink-0" variant="outline">
										{StatusIcon && (
											<StatusIcon aria-hidden="true" className={status.className} />
										)}
										{status.label}
									</AppBadge>
								)}
							</div>
						</div>
						<div>
							<p className="text-muted-foreground text-xs">Valor da fatura</p>
							<strong className="block text-2xl tabular-nums">
								{
									<PreferredMoneyAmount
										values={[{ amount: invoiceAmount, currency: currencyCode }]}
									/>
								}
							</strong>
							{forecasts.length > 0 && (
								<p className="text-muted-foreground mt-1 text-xs">
									Previsão:{" "}
									<PreferredMoneyAmount
										values={[{ amount: projectedAmount, currency: currencyCode }]}
									/>
								</p>
							)}
							{displayedStatement.manualTotalAmount != null && (
								<p className="text-muted-foreground mt-1 text-sm">
									Valor original:{" "}
									<PreferredMoneyAmount
										values={[
											{
												amount: displayedStatement.calculatedTotalAmount ?? 0,
												currency: currencyCode,
											},
										]}
									/>
								</p>
							)}

							{!isIgnored && Math.abs(invoiceAmount - remainingAmount) > 0.001 && (
								<p className="text-muted-foreground mt-1 text-sm">
									{remainingAmount < 0 ? "Crédito" : "Restante a pagar"}:{" "}
									{
										<PreferredMoneyAmount
											values={[
												{ amount: Math.abs(remainingAmount), currency: currencyCode },
											]}
										/>
									}
								</p>
							)}
						</div>
						<div className="grid grid-cols-2 gap-2 border-t pt-2">
							<div className="min-w-0">
								<p className="text-muted-foreground flex items-center gap-1 text-xs">
									<LuCalendarCheck /> Fechamento
								</p>
								<strong className="mt-0.5 block text-sm">
									{formatLocalDate(displayedStatement.statementDate)}
								</strong>
							</div>
							<div className="min-w-0 border-l pl-2">
								<p className="text-muted-foreground flex items-center gap-1 text-xs">
									<LuCalendarClock /> Vencimento
								</p>
								<strong className="mt-0.5 block text-sm">
									{formatLocalDate(displayedStatement.dueDate)}
								</strong>
							</div>
						</div>
						<ActionGroup>
							<Button
								disabled={
									detail.isPending ||
									Boolean(backgroundPending[`${identity}:credit-statement:${statement.id}`])
								}
								onClick={() => {
									setRecoveredAction(null);
									setEditingStatement(true);
								}}
								variant="outline"
							>
								<LuPencil aria-hidden="true" />
								Editar fatura
							</Button>
						</ActionGroup>
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
						{!detail.isPending && !detail.isError && forecasts.length > 0 && (
							<CollapsibleListingSection title="Previsões">
								{forecasts.map(purchase => (
									<CreditPurchaseRow
										deleteDisabled
										editDisabled
										key={purchase.id}
										onDelete={async () => {}}
										onEdit={() => {}}
										onRefinance={() => {}}
										onRefund={() => {}}
										purchase={purchase}
										refinanceDisabled
										refundDisabled
									/>
								))}
							</CollapsibleListingSection>
						)}
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
												statement.isForecast === true || rowPending(entry.purchase)
											}
											editDisabled={
												statement.isForecast === true || rowPending(entry.purchase)
											}
											key={entry.id}
											onDelete={() => deletePurchase.mutateAsync(entry.purchase.id)}
											onEdit={() =>
												entry.purchase.isRefund
													? (setRecoveredAction(null),
														setRefundingPurchase(entry.purchase))
													: entry.purchase.parentId && !entry.purchase.isSynced
														? setChoosingEditScope(entry.purchase)
														: setEditingPurchase(
																entry.purchase.isSynced &&
																	entry.purchase.parentId
																	? {
																			...entry.purchase,
																			id:
																				entry.purchase.purchaseId ??
																				entry.purchase.parentId,
																			parentId: undefined,
																		}
																	: entry.purchase,
															)
											}
											onRefinance={() => {
												setRecoveredAction(null);
												setRefinancingPurchase(entry.purchase);
											}}
											onRefund={() => setManagingRefunds(entry.purchase)}
											purchase={entry.purchase}
											refinanceDisabled={
												displayedStatement.isPaid ||
												statement.isForecast === true ||
												rowPending(entry.purchase) ||
												entry.purchase.isStatementCharge === true ||
												entry.purchase.isSettled === true
											}
											refundDisabled={
												statement.isForecast === true || rowPending(entry.purchase)
											}
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
			</DialogBody>
			<ActionGroup className="absolute right-3 bottom-3 z-10">
				<FloatingActionMenu
					actions={[
						{ icon: LuPlus, label: "Nova compra", onClick: onAddPurchase },
						{ icon: LuFileUp, label: "Importar fatura", onClick: () => setIsImportOpen(true) },
					]}
				/>
			</ActionGroup>
			<ImportCreditCardStatementDialog
				cards={[card]}
				onImported={setReviewingImportId}
				onOpenChange={setIsImportOpen}
				open={isImportOpen}
			/>
			<CreditCardImportReviewDialog
				importId={reviewingImportId}
				onOpenChange={open => !open && setReviewingImportId(null)}
				open={reviewingImportId !== null}
			/>
			{editingStatement && (
				<EditCreditCardStatementDialog
					currency={currencyCode}
					initialValues={
						recoveredAction?.action === "dates"
							? {
									dueDate: recoveredAction.data!.dueDate!,
									manualTotalAmount: recoveredAction.data!.manualTotalAmount,
									statementDate: recoveredAction.data!.statementDate!,
								}
							: undefined
					}
					onOpenChange={open => {
						setEditingStatement(open);
						if (!open) setRecoveredAction(null);
					}}
					statement={displayedStatement}
				/>
			)}
			{choosingEditScope && (
				<CreditPurchaseEditScopeDialog
					onOpenChange={open => !open && setChoosingEditScope(null)}
					onSelect={scope => {
						setEditingPurchase(
							scope === "installment"
								? choosingEditScope
								: {
										...choosingEditScope,
										id: choosingEditScope.purchaseId ?? choosingEditScope.parentId!,
										parentId: undefined,
									},
						);
						setChoosingEditScope(null);
					}}
					purchase={choosingEditScope}
				/>
			)}
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
					initialValues={
						recoveredAction?.action === "refinance"
							? {
									...recoveredAction.data,
									installments: recoveredAction.data!.installments!,
									purchaseDate: recoveredAction.data!.purchaseDate!,
								}
							: undefined
					}
					onOpenChange={open => {
						if (!open) {
							setRefinancingPurchase(null);
							setRecoveredAction(null);
						}
					}}
					onSubmit={async data => {
						backgroundAction(
							{
								action: "refinance",
								cardId: card.id,
								data,
								purchase: refinancingPurchase,
								statement,
							},
							() => setRefinancingPurchase(null),
							() =>
								dataService.creditCards.refinancePurchase(
									card.id,
									refinancingPurchase.id,
									data,
								),
						);
					}}
					open
					pending={rowPending(refinancingPurchase)}
					purchase={refinancingPurchase}
				/>
			)}
			{managingRefunds && (
				<ManageCreditPurchaseRefundsDialog
					onAdd={() => {
						setRecoveredAction(null);
						setRefundingPurchase(managingRefunds);
					}}
					onDelete={async id => {
						await deleteRefund({
							...managingRefunds,
							id,
							isRefund: true,
							purchaseId: managingRefunds.purchaseId ?? managingRefunds.id,
						});
					}}
					onEdit={refund => {
						setRecoveredAction(null);
						setRefundingPurchase({
							...managingRefunds,
							id: refund.id,
							installmentAmount: -refund.creditAmount,
							isRefund: true,
							purchaseDate: refund.date,
							purchaseId: managingRefunds.purchaseId ?? managingRefunds.id,
							refund,
							totalAmount: -refund.amount,
						});
					}}
					onOpenChange={open => !open && setManagingRefunds(null)}
					open
					pendingRefundIds={
						new Set([
							...(managingRefunds.refunds ?? [])
								.filter(() => rowPending(managingRefunds))
								.map(refund => refund.id),
						])
					}
					purchase={managingRefunds}
				/>
			)}
			{refundingPurchase && (
				<RefundCreditPurchaseDialog
					initialValues={recoveredAction?.action === "refund" ? recoveredAction.data : undefined}
					key={refundingPurchase.id}
					onDelete={
						refundingPurchase.isRefund
							? async () => {
									await deleteRefund(refundingPurchase);
								}
							: undefined
					}
					onOpenChange={open => {
						if (!open) {
							setRefundingPurchase(null);
							setRecoveredAction(null);
						}
					}}
					onSubmit={async data => {
						const purchase = refundingPurchase;
						const purchaseId = purchase.purchaseId ?? purchase.refundOfPurchaseId ?? purchase.id;
						backgroundAction(
							{ action: "refund", cardId: card.id, data, purchase, statement },
							() => setRefundingPurchase(null),
							() =>
								purchase.isRefund
									? dataService.creditCards.updateRefund(card.id, purchaseId, purchase.id, {
											amount: data.amount ?? Math.abs(purchase.totalAmount),
											canceledInstallmentNumbers: data.canceledInstallmentNumbers,
											date: data.date ?? purchase.purchaseDate.slice(0, 10),
										})
									: dataService.creditCards.refundPurchase(card.id, purchaseId, data),
						);
					}}
					open
					pending={rowPending(refundingPurchase)}
					purchase={refundingPurchase}
					refund={refundingPurchase.isRefund ? refundingPurchase.refund : undefined}
					refundId={refundingPurchase.isRefund ? refundingPurchase.id : undefined}
				/>
			)}
		</TabsContent>
	);
}
