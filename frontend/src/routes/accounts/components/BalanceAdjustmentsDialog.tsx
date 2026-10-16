import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type BalanceAdjustmentDraft, BalanceAdjustmentForm } from "./BalanceAdjustmentForm";

const formatMoney = (value: number, currency: string) =>
	new Intl.NumberFormat("pt-BR", { currency, style: "currency" }).format(value);
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
	const [recoveredDraft, setRecoveredDraft] = useState<BalanceAdjustmentDraft | null>(null);
	const pending = useModalRecoveryStore(state => state.pending);
	useBackgroundModalRecovery<BalanceAdjustmentDraft>("balance-adjustment", entry => {
		setRecoveredDraft(entry.payload);
		setEditing(entry.payload.adjustment ?? "new");
		onOpenChange(true);
	});
	const adjustmentsKey = ["identity", identity, "balance-adjustments"] as const;
	const adjustmentsQuery = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.balanceAdjustments.getAll(),
		queryKey: adjustmentsKey,
		refetchInterval: open ? 5000 : false,
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
	const groups = Array.from(
		(adjustments ?? []).reduce((groups, adjustment) => {
			const entries = groups.get(adjustment.financialAccountId) ?? [];
			entries.push(adjustment);
			groups.set(adjustment.financialAccountId, entries);
			return groups;
		}, new Map<string, BalanceAdjustment[]>()),
	);
	useBackgroundModalRecovery<BalanceAdjustment>("balance-adjustment-delete", () => onOpenChange(true));
	const remove = (adjustment: BalanceAdjustment) =>
		runBackgroundModalAction({
			close: () => onOpenChange(false),
			conflictKey: `balance-adjustment:${adjustment.id}`,
			failureMessage: "Não foi possível excluir ajuste.",
			loadingMessage: "Excluindo ajuste...",
			onSuccess: () =>
				Promise.all([
					invalidateCacheOperation(queryClient, identity!, "transaction"),
					queryClient.invalidateQueries({ queryKey: adjustmentsKey }),
				]),
			recovery: { entityId: adjustment.id, kind: "balance-adjustment-delete", payload: adjustment },
			run: () => dataService.balanceAdjustments.delete(adjustment.id),
			successMessage: "Ajuste de saldo excluído.",
		});
	return (
		<>
			<Dialog onOpenChange={onOpenChange} open={open && editing === null}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Ajustes de saldo</DialogTitle>
						<DialogDescription>
							Compare o saldo calculado com o saldo corrigido ao fim de cada dia. O ajuste compensa
							movimentações anteriores automaticamente.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div>
							<div className="grid gap-2">
								{adjustmentsQuery.isPending || accountsQuery.isPending ? (
									<Skeleton className="h-28 rounded-xl" />
								) : null}
								{adjustmentsQuery.isError || accountsQuery.isError ? (
									<p className="text-destructive text-sm">Não foi possível carregar os ajustes.</p>
								) : null}
								{!accountsQuery.isPending &&
								!accountsQuery.isError &&
								!adjustmentsQuery.isPending &&
								!adjustmentsQuery.isError &&
								adjustments?.length === 0 ? (
									<p className="text-muted-foreground text-sm">Nenhum ajuste registrado.</p>
								) : null}
								{!accountsQuery.isPending &&
									!accountsQuery.isError &&
									!adjustmentsQuery.isPending &&
									!adjustmentsQuery.isError &&
									groups.map(([accountId, entries]) => (
										<section className="grid min-w-0 gap-3 rounded-xl border p-3" key={accountId}>
											<h3 className="min-w-0 truncate font-medium">
												{accountNames.get(accountId) ?? entries[0]?.name ?? "Conta"}
											</h3>
											<ActionGroup>
												<Button
													onClick={() => {
														setRecoveredDraft({
															adjustment: null,
															balance: "",
															date: "",
															financialAccountId: accountId,
														});
														setEditing("new");
													}}
													size="sm"
													variant="outline"
												>
													<LuPlus /> Adicionar data
												</Button>
											</ActionGroup>
											{entries.map(adjustment => (
												<div
													className="flex flex-wrap items-center justify-between gap-3 rounded-lg border p-3"
													key={adjustment.id}
												>
													<div className="min-w-0">
														<p className="text-muted-foreground text-sm">
															{formatLocalDate(adjustment.date)}
														</p>
														<p className="text-muted-foreground text-sm">
															Saldo sem ajuste:{" "}
															{formatMoney(
																Number(adjustment.calculatedBalance),
																adjustment.currency ?? "BRL",
															)}
														</p>
														<p className="text-sm">
															Saldo corrigido:{" "}
															{formatMoney(Number(adjustment.balance), adjustment.currency ?? "BRL")}
														</p>
													</div>
													<ActionGroup className="ml-auto shrink-0 gap-1">
														<Tooltip>
															<TooltipTrigger asChild>
																<Button
																	aria-label="Editar ajuste"
																	className="cursor-pointer"
																	disabled={!!pending[`${identity}:balance-adjustment:${adjustment.id}`]}
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
																		disabled={!!pending[`${identity}:balance-adjustment:${adjustment.id}`]}
																		onConfirm={() => remove(adjustment)}
																		size="icon-sm"
																		variant="outline"
																	>
																		<LuTrash2 />
																	</ConfirmActionButton>
																</span>
															</TooltipTrigger>
															<TooltipContent>Excluir</TooltipContent>
														</Tooltip>
													</ActionGroup>
												</div>
											))}
										</section>
									))}
							</div>
						</div>
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!adjustmentsQuery.isSuccess || adjustmentsQuery.isFetching}
							onClick={() => setEditing("new")}
						>
							<LuPlus /> Novo ajuste
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
			{editing !== null ? (
				<BalanceAdjustmentForm
					adjustment={editing === "new" ? null : editing}
					existingAdjustments={adjustmentsQuery.data ?? []}
					initialDraft={recoveredDraft ?? undefined}
					key={editing === "new" ? "new" : editing.id}
					onClose={() => {
						setEditing(null);
						setRecoveredDraft(null);
					}}
				/>
			) : null}
		</>
	);
}
