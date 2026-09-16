import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useLocation } from "@tanstack/react-router";
import { useEffect, useState } from "react";
import { LuCreditCard, LuPlus, LuReceiptText } from "react-icons/lu";
import { CreateTransactionDialog } from "@/components/transactions";
import { Button } from "@/components/ui/Button";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { dataService } from "@/lib/dataService";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreatePurchaseDialog } from "../credit-cards/components";

export function DashboardQuickActions() {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const pathname = useLocation().pathname;
	const [menuOpen, setMenuOpen] = useState(false);
	const [transactionOpen, setTransactionOpen] = useState(false);
	const [purchaseOpen, setPurchaseOpen] = useState(false);

	useEffect(() => {
		setMenuOpen(false);
		setTransactionOpen(false);
		setPurchaseOpen(false);
	}, [pathname]);

	const cards = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getAll(),
		queryKey: queryKeys.creditCards.list(identity!),
	});
	const purchase = useMutation({
		mutationFn: ({
			cardId,
			data,
		}: {
			cardId: string;
			data: Parameters<typeof dataService.creditCards.addPurchase>[1];
		}) => dataService.creditCards.addPurchase(cardId, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "statement");
			showToast("Compra registrada e faturas recalculadas.", "positive");
		},
	});

	return (
		<>
			<Popover onOpenChange={setMenuOpen} open={menuOpen}>
				<PopoverTrigger asChild>
					<Button className="cursor-pointer">
						<LuPlus /> Adicionar
					</Button>
				</PopoverTrigger>
				<PopoverContent align="end" className="w-72 gap-2">
					<Button
						className="w-full cursor-pointer justify-start"
						onClick={() => {
							setMenuOpen(false);
							setTransactionOpen(true);
						}}
						variant="outline"
					>
						<LuReceiptText /> Nova transação
					</Button>
					<p className="px-1 pt-2 font-medium text-muted-foreground text-xs">Compra no cartão</p>
					{cards.isPending ? (
						<p className="px-1 text-muted-foreground text-sm">Carregando cartões…</p>
					) : cards.data?.length ? (
						<Button
							className="w-full cursor-pointer justify-start"
							onClick={() => {
								setMenuOpen(false);
								setPurchaseOpen(true);
							}}
							variant="outline"
						>
							<LuCreditCard /> Nova compra
						</Button>
					) : (
						<p className="px-1 text-muted-foreground text-sm">Nenhum cartão cadastrado.</p>
					)}
				</PopoverContent>
			</Popover>
			<CreateTransactionDialog onOpenChange={setTransactionOpen} open={transactionOpen} />
			<CreatePurchaseDialog
				cards={cards.data ?? []}
				onOpenChange={setPurchaseOpen}
				onSubmit={async (cardId, data) => {
					await purchase.mutateAsync({ cardId, data });
				}}
				open={purchaseOpen}
				pending={purchase.isPending}
			/>
		</>
	);
}
