import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { BalanceAdjustmentForm } from "./BalanceAdjustmentForm";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

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
				<DialogContent className="max-h-[90dvh] sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ajustes de saldo</DialogTitle>
						<DialogDescription>
							Registre quanto havia em uma conta ao fim de um dia. O ajuste compensa automaticamente
							transações importadas antes dessa data.
						</DialogDescription>
					</DialogHeader>
					<div className="scrollbar-themed grid max-h-[60dvh] gap-2 overflow-y-auto pr-1">
						{adjustmentsQuery.isPending ? <Skeleton className="h-20 rounded-xl" /> : null}
						{adjustmentsQuery.isError ? (
							<p className="text-destructive text-sm">Não foi possível carregar os ajustes.</p>
						) : null}
						{adjustmentsQuery.data?.length === 0 ? (
							<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
						) : null}
						{adjustmentsQuery.data?.map(adjustment => (
							<div
								className="flex items-center justify-between gap-3 rounded-xl border p-3"
								key={adjustment.id}
							>
								<div className="min-w-0">
									<p className="truncate font-medium">{adjustment.name || "Conta"}</p>
									<p className="text-muted-foreground text-sm">
										{formatLocalDate(adjustment.date)} - {currency.format(adjustment.balance)}
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
					<Button className="cursor-pointer" onClick={() => setEditing("new")}>
						<LuPlus /> Novo ajuste
					</Button>
				</DialogContent>
			</Dialog>
			{editing !== null ? (
				<BalanceAdjustmentForm
					adjustment={editing === "new" ? null : editing}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => setEditing(null)}
				/>
			) : null}
		</>
	);
}
