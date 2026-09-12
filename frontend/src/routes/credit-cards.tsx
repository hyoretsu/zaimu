import { useMutation, useQueries, useQuery, useQueryClient } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { useState } from "react";
import { LuCreditCard, LuFileUp, LuPlus } from "react-icons/lu";
import {
	CreditCardImportReviewDialog,
	ImportCreditCardStatementDialog,
	PendingCreditCardImportsNotice,
} from "@/components/credit-card-imports";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import type { CreditCard } from "@/lib/api";
import { calculateCreditCardLimit, getCreditCardDisplayName } from "@/lib/credit-card";
import { dataService } from "@/lib/dataService";
import { showToast, useAuthStore } from "@/stores";
import { CreateFinancialAccountDialog } from "./accounts/components";
import {
	CreatePurchaseDialog,
	CreditCardOverviewCard,
	CreditCardStatementsDialog,
} from "./credit-cards/components";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

function CreditCardsPage() {
	const queryClient = useQueryClient();
	const hasAccess = useAuthStore(state => state.isAuthenticated || state.isGuestMode);
	const [selectedCard, setSelectedCard] = useState<CreditCard | null>(null);
	const [statementsCard, setStatementsCard] = useState<CreditCard | null>(null);
	const [isCreateCardOpen, setIsCreateCardOpen] = useState(false);
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const cards = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: ["credit-cards"],
	});
	const statementQueries = useQueries({
		queries: (cards.data ?? []).map(card => ({
			queryFn: () => dataService.creditCards.getStatements(card.id),
			queryKey: ["credit-card-statements", card.id, { isPaid: undefined }],
		})),
	});
	const purchase = useMutation({
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
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["credit-card-statements"] }),
				queryClient.invalidateQueries({ queryKey: ["debts"] }),
			]);
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});
	const createCard = useMutation({
		mutationFn: dataService.accounts.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await Promise.all([
				queryClient.invalidateQueries({ queryKey: ["financial-accounts"] }),
				queryClient.invalidateQueries({ queryKey: ["credit-cards"] }),
			]);
			showToast("Cartão cadastrado.", "positive");
		},
	});
	const totalLimit =
		cards.data?.reduce(
			(sum, card, index) =>
				sum +
				(card.excludeFromTotals
					? 0
					: calculateCreditCardLimit(card, statementQueries[index]?.data ?? []).effectiveLimit),
			0,
		) ?? 0;
	const isTotalLimitPending = cards.isPending || statementQueries.some(query => query.isPending);
	const ownCardsCount = cards.data?.filter(card => !card.excludeFromTotals).length ?? 0;
	const sortedCards = [...(cards.data ?? [])].sort((firstCard, secondCard) =>
		getCreditCardDisplayName(firstCard).localeCompare(getCreditCardDisplayName(secondCard), "pt-BR", {
			sensitivity: "base",
		}),
	);

	return (
		<PageContainer className="grid gap-8">
			<PageHeader
				actions={
					<div className="flex flex-wrap justify-end gap-2">
						<Button
							className="h-11 cursor-pointer"
							disabled={!cards.data?.length}
							onClick={() => setIsImportOpen(true)}
							variant="outline"
						>
							<LuFileUp /> Importar fatura
						</Button>
						<Button className="h-11 cursor-pointer" onClick={() => setIsCreateCardOpen(true)}>
							<LuPlus /> Novo cartão
						</Button>
					</div>
				}
				description="Acompanhe limite, previsão de fatura e parcelamentos."
				eyebrow="Crédito"
				title="Cartões e compras"
			/>
			<PendingCreditCardImportsNotice onReview={setReviewingImportId} />
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl bg-brand-yellow p-5 text-brand-ink shadow-card">
					<p className="text-brand-ink/60 text-sm">Limite total</p>
					{isTotalLimitPending ? (
						<Skeleton className="mt-2 h-9 w-40 bg-brand-ink/10" />
					) : (
						<p className="mt-2 font-bold text-3xl">{currency.format(totalLimit)}</p>
					)}
				</div>
				<div className="rounded-2xl border bg-card p-5 shadow-card">
					<p className="text-muted-foreground text-sm">Seus cartões</p>
					<p className="mt-2 font-bold text-3xl">{ownCardsCount}</p>
				</div>
			</section>
			{cards.isPending ? (
				<div className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{[1, 2, 3].map(item => (
						<Skeleton className="h-72" key={item} />
					))}
				</div>
			) : cards.isError ? (
				<EmptyState
					description="Tente novamente em instantes."
					icon={<LuCreditCard className="size-7" />}
					title="Não foi possível carregar cartões"
				/>
			) : cards.data?.length ? (
				<section className="grid gap-5 md:grid-cols-2 xl:grid-cols-3">
					{sortedCards.map(card => (
						<CreditCardOverviewCard
							card={card}
							key={card.id}
							onAddPurchase={() => setSelectedCard(card)}
							onViewStatements={() => setStatementsCard(card)}
						/>
					))}
				</section>
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
				onOpenChange={open => !open && setSelectedCard(null)}
				onSubmit={async (cardId, data) => {
					await purchase.mutateAsync({
						cardId,
						data,
					});
				}}
				open={Boolean(selectedCard)}
				pending={purchase.isPending}
			/>
			<CreditCardStatementsDialog
				card={statementsCard}
				onOpenChange={open => !open && setStatementsCard(null)}
			/>
			<CreateFinancialAccountDialog
				defaultType="CREDIT_CARD"
				onCreate={data => createCard.mutateAsync(data)}
				onOpenChange={setIsCreateCardOpen}
				open={isCreateCardOpen}
				pending={createCard.isPending}
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

export const Route = createFileRoute("/credit-cards")({ component: CreditCardsPage });
