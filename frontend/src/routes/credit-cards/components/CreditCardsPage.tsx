import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useEffect, useState } from "react";
import { LuCreditCard, LuFileUp, LuPlus, LuScale } from "react-icons/lu";
import {
	CreditCardImportReviewDialog,
	ImportCreditCardStatementDialog,
} from "@/components/credit-card-imports";
import { NativeMoneyTotals } from "@/components/currency/NativeMoneyTotals";
import { PendingNotices } from "@/components/pending-notices";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getFinancialInstitutions } from "@/lib/financial-institution";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CreateFinancialAccountDialog } from "@/routes/accounts/components";
import {
	CardAdjustmentsDialog,
	CreatePurchaseDialog,
	CreditCardStatementsDialog,
	CreditCardsGrid,
} from "@/routes/credit-cards/components";
import { showToast, useAuthStore } from "@/stores";
import type { StatementActionRecovery } from "./statement-action-recovery";

export function CreditCardsPage() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const hasAccess = useAuthStore(state => state.isAuthenticated || state.isGuestMode);
	const [selectedCardId, setSelectedCardId] = useState<string | null>(null);
	const [isCreatePurchaseOpen, setIsCreatePurchaseOpen] = useState(false);
	const [statementsCardId, setStatementsCardId] = useState<string | null>(null);
	const requestedRecovery = useModalRecoveryStore(state =>
		state.requestedId ? state.entries[state.requestedId] : undefined,
	);
	useEffect(() => {
		if (
			!requestedRecovery?.kind.startsWith("credit-statement-action:") ||
			requestedRecovery.identity !== identity ||
			requestedRecovery.path !== window.location.pathname + window.location.search
		)
			return;
		setStatementsCardId((requestedRecovery.payload as StatementActionRecovery).cardId);
	}, [requestedRecovery, identity]);

	const [isCreateCardOpen, setIsCreateCardOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [isCardAdjustmentsOpen, setIsCardAdjustmentsOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const cards = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
		retry: 0,
	});
	const accounts = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const institutions = getFinancialInstitutions(accounts.data ?? []);
	const rewardAccounts = accounts.data?.filter(account => account.type === "REWARDS") ?? [];
	const purchase = useMutation({
		meta: { cacheOperations: ["statement"] },
		mutationFn: ({
			cardId,
			data,
		}: {
			cardId: string;
			data: Parameters<typeof dataService.creditCards.addPurchase>[1];
		}) => dataService.creditCards.addPurchase(cardId, data),
		onError: error =>
			showToast(error instanceof Error ? error.message : "Não foi possível registrar a compra.", "negative"),
		onSuccess: async () => {
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});
	const createCard = useMutation({
		meta: { cacheOperations: ["creditCard"] },
		mutationFn: dataService.accounts.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Cartão cadastrado.", "positive");
		},
	});
	const updateCard = useMutation({
		meta: { cacheOperations: ["creditCard"] },
		mutationFn: ({ data, id }: { id: string; data: Parameters<typeof dataService.accounts.update>[1] }) =>
			dataService.accounts.update(id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Cartão atualizado.", "positive");
		},
	});
	const deleteCard = useMutation({
		meta: { cacheOperations: ["creditCard"] },
		mutationFn: dataService.accounts.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Cartão excluído.", "positive");
		},
	});
	const hideCard = useMutation({
		meta: { cacheOperations: ["creditCard"] },
		mutationFn: (id: string) => dataService.accounts.update(id, { isHidden: true }),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Cartão escondido. Mostre novamente em Contas financeiras.", "positive");
		},
	});

	const ownCardsCount = cards.data?.filter(card => !card.excludeFromTotals).length ?? 0;
	const handleDelete = useCallback((id: string) => deleteCard.mutateAsync(id), [deleteCard.mutateAsync]);
	const handleHide = useCallback((id: string) => hideCard.mutateAsync(id), [hideCard.mutateAsync]);
	const handleUpdate = useCallback(
		(id: string, data: Parameters<typeof dataService.accounts.update>[1]) =>
			updateCard.mutateAsync({ data, id }),
		[updateCard.mutateAsync],
	);
	const selectedCard = cards.data?.find(card => card.id === selectedCardId) ?? null;
	const statementsCard = cards.data?.find(card => card.id === statementsCardId) ?? null;

	return (
		<PageContainer className="grid gap-8">
			<PageHeader
				actions={[
					{
						disabled: !cards.data?.length,
						icon: LuCreditCard,
						label: "Nova compra",
						onClick: () => setIsCreatePurchaseOpen(true),
					},
					{
						disabled: !cards.data?.length,
						icon: LuScale,
						label: "Ajustes de cartões",
						onClick: () => setIsCardAdjustmentsOpen(true),
					},
					{
						disabled: !cards.data?.length,
						icon: LuFileUp,
						label: "Importar fatura",
						onClick: () => setIsImportOpen(true),
					},
					{
						icon: LuPlus,
						label: "Novo cartão",
						onClick: () => setIsCreateCardOpen(true),
						variant: "default",
					},
				]}
				description="Acompanhe limite, previsão de fatura e parcelamentos."
				subtitle="Crédito"
				title="Cartões e compras"
			/>
			<PendingNotices onReviewCreditCardImport={setReviewingImportId} paymentSuggestions />
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl bg-brand-yellow p-5 text-brand-ink shadow-card">
					<p className="text-brand-ink/60 text-sm">Limite total</p>
					{cards.isPending ? (
						<Skeleton className="mt-2 h-9 w-40 bg-brand-ink/10" />
					) : (
						<NativeMoneyTotals
							error={cards.isError && cards.data === undefined}
							pending={cards.isPending}
							values={(cards.data ?? [])
								.filter(card => !card.excludeFromTotals)
								.map(card => ({ amount: card.limit.effectiveLimit, currency: card.currency ?? "BRL" }))}
						/>
					)}
				</div>
				<div className="rounded-2xl border bg-card p-5 shadow-card">
					<p className="text-muted-foreground text-sm">Seus cartões</p>
					<p className="mt-2 font-bold text-3xl">{ownCardsCount}</p>
				</div>
			</section>
			<QueryRefreshStatus
				error={cards.isError && cards.data !== undefined}
				onRetry={() => cards.refetch()}
				pending={cards.isFetching && !cards.isPending}
			/>
			{cards.isPending ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{[1, 2, 3].map(item => (
						<Skeleton className="h-72" key={item} />
					))}
				</div>
			) : cards.isError && cards.data === undefined ? (
				<EmptyState
					action={
						<Button className="cursor-pointer" onClick={() => cards.refetch()} variant="outline">
							Tentar novamente
						</Button>
					}
					description="Tente novamente em instantes."
					icon={<LuCreditCard className="size-7" />}
					title="Não foi possível carregar cartões"
				/>
			) : cards.data?.length ? (
				<CreditCardsGrid
					accounts={accounts.data}
					accountsPending={accounts.isPending}
					cards={cards.data}
					onAddPurchase={setSelectedCardId}
					onDelete={handleDelete}
					onHide={handleHide}
					onUpdate={handleUpdate}
					onViewStatements={setStatementsCardId}
				/>
			) : (
				<EmptyState
					action={
						<Button onClick={() => setIsCreateCardOpen(true)}>
							<LuPlus /> Cadastrar cartão
						</Button>
					}
					description="Cadastre seu cartão sem sair desta tela."
					icon={<LuCreditCard className="size-7" />}
					title="Nenhum cartão cadastrado"
				/>
			)}
			<CreatePurchaseDialog
				cards={cards.data ?? []}
				initialCardId={selectedCard?.id}
				key={selectedCard?.id ?? "purchase"}
				onOpenChange={open => {
					setIsCreatePurchaseOpen(open);
					if (!open) setSelectedCardId(null);
				}}
				onSubmit={async (cardId, data) => {
					await purchase.mutateAsync({
						cardId,
						data,
					});
				}}
				open={isCreatePurchaseOpen || Boolean(selectedCard)}
				pending={purchase.isPending}
			/>
			<CreditCardStatementsDialog
				card={statementsCard}
				onOpenChange={open => !open && setStatementsCardId(null)}
			/>
			<CardAdjustmentsDialog
				cards={cards.data ?? []}
				onOpenChange={setIsCardAdjustmentsOpen}
				open={isCardAdjustmentsOpen}
			/>
			<CreateFinancialAccountDialog
				cardOnly
				defaultType="CREDIT_CARD"
				institutions={institutions}
				onCreate={data => createCard.mutateAsync(data)}
				onOpenChange={setIsCreateCardOpen}
				open={isCreateCardOpen}
				pending={createCard.isPending}
				rewardAccounts={rewardAccounts}
				showTrigger={false}
			/>
			<ImportCreditCardStatementDialog
				cards={cards.data ?? []}
				onImported={setReviewingImportId}
				onOpenChange={setIsImportOpen}
				open={isImportOpen}
			/>
			<CreditCardImportReviewDialog
				importId={reviewingImportId}
				onOpenChange={open => !open && setReviewingImportId(null)}
				open={reviewingImportId !== null}
			/>
		</PageContainer>
	);
}
