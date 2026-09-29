import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { BalanceAdjustmentForm } from "./BalanceAdjustmentForm";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const nameCollator = new Intl.Collator("pt-BR", { sensitivity: "base" });

export function BalanceAdjustmentsDialog({
	onOpenChange,
	open,
}: {
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [editing, setEditing] = useState<BalanceAdjustment | null | "new">(null);
	const adjustmentsKey = ["identity", identity, "balance-adjustments"] as const;
	const adjustmentsQuery = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.balanceAdjustments.getAll(),
		queryKey: adjustmentsKey,
	});
	const accountsQuery = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const accountNames = new Map(
		(accountsQuery.data ?? []).map(account => [account.id, getFinancialAccountOptionLabel(account)]),
	);
	const adjustments = adjustmentsQuery.data?.toSorted((left, right) => {
		const byName = nameCollator.compare(
			accountNames.get(left.financialAccountId) ?? left.name ?? "Conta",
			accountNames.get(right.financialAccountId) ?? right.name ?? "Conta",
		);
		return byName || right.date.localeCompare(left.date);
	});
	const remove = useMutation({
		mutationFn: (id: string) => dataService.balanceAdjustments.delete(id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await Promise.all([
				invalidateCacheOperation(queryClient, identity!, "transaction"),
				queryClient.invalidateQueries({ queryKey: adjustmentsKey }),
			]);
			showToast("Ajuste de saldo excluído.", "positive");
		},
	});
	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open && editing === null}>
				<DialogContent className="max-h-[90dvh] grid-rows-[auto_minmax(0,1fr)_auto] overflow-hidden sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ajustes de saldo</DialogTitle>
						<DialogDescription>
							Compare o saldo calculado com o saldo corrigido ao fim de cada dia. O ajuste compensa
							movimentações anteriores automaticamente.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[60dvh] min-h-0 pr-3" type="always">
						<div className="grid gap-2">
							{adjustmentsQuery.isPending || accountsQuery.isPending ? (
								<Skeleton className="h-28 rounded-xl" />
							) : null}
							{adjustmentsQuery.isError || accountsQuery.isError ? (
								<p className="text-destructive text-sm">Não foi possível carregar os ajustes.</p>
							) : null}
							{!accountsQuery.isPending && adjustments?.length === 0 ? (
								<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
							) : null}
							{!accountsQuery.isPending &&
								!accountsQuery.isError &&
								adjustments?.map(adjustment => (
									<div
										className="flex items-center justify-between gap-3 rounded-xl border p-3"
										key={adjustment.id}
									>
										<div className="min-w-0">
											<p className="truncate font-medium">
												{accountNames.get(adjustment.financialAccountId) ?? adjustment.name ?? "Conta"}
											</p>
											<p className="text-muted-foreground text-sm">{formatLocalDate(adjustment.date)}</p>
											<p className="text-muted-foreground text-sm">
												Saldo sem ajuste: {currency.format(Number(adjustment.calculatedBalance))}
											</p>
											<p className="text-sm">
												Saldo corrigido: {currency.format(Number(adjustment.balance))}
											</p>
										</div>
										<div className="flex shrink-0 gap-1">
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														aria-label="Editar ajuste"
														className="cursor-pointer"
														onClick={() => setEditing(adjustment)}
														size="icon-sm"
														variant="outline"
													>
														<LuPencil />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Editar</TooltipContent>
											</Tooltip>
											<Tooltip>
												<TooltipTrigger asChild>
													<span>
														<ConfirmActionButton
															aria-label="Excluir ajuste"
															className="cursor-pointer"
															confirmation="Excluir este ajuste permanentemente?"
															disabled={remove.isPending && remove.variables === adjustment.id}
															onConfirm={() => remove.mutate(adjustment.id)}
															size="icon-sm"
															variant="outline"
														>
															<LuTrash2 />
														</ConfirmActionButton>
													</span>
												</TooltipTrigger>
												<TooltipContent>Excluir</TooltipContent>
											</Tooltip>
										</div>
									</div>
								))}
						</div>
					</ScrollArea>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!adjustmentsQuery.isSuccess || adjustmentsQuery.isFetching}
						onClick={() => setEditing("new")}
					>
						<LuPlus /> Novo ajuste
					</Button>
				</DialogContent>
			</Dialog>
			{editing !== null ? (
				<BalanceAdjustmentForm
					adjustment={editing === "new" ? null : editing}
					existingAdjustments={adjustmentsQuery.data ?? []}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}
