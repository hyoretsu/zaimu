import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuChevronRight, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
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
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { formatLocalDate } from "@/lib/date";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type BalanceAdjustmentDraft, BalanceAdjustmentForm } from "../BalanceAdjustmentForm";
import { AccountAdjustmentsDialog } from "./AccountAdjustmentsDialog";

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
	const [accountId, setAccountId] = useState<string | null>(null);
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
			close: () => {
				setAccountId(null);
				onOpenChange(false);
			},
			conflictKey: `balance-adjustment:${adjustment.id}`,
			failureMessage: "Não foi possível excluir ajuste.",
			loadingMessage: "Excluindo ajuste...",
			cache: { client: queryClient, operations: ["transaction"] },
			recovery: { entityId: adjustment.id, kind: "balance-adjustment-delete", payload: adjustment },
			run: () => dataService.balanceAdjustments.delete(adjustment.id),
			successMessage: "Ajuste de saldo excluído.",
		});
	const form =
		open && editing !== null ? (
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
		) : null;
	return (
		<Dialog
			onOpenChange={value => {
				if (!value) {
					setAccountId(null);
					setEditing(null);
					setRecoveredDraft(null);
				}
				onOpenChange(value);
			}}
			open={open}
		>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Ajustes de saldo</DialogTitle>
					<DialogDescription>Selecione uma conta para consultar e gerenciar seus ajustes.</DialogDescription>
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
									<button
										className="flex min-w-0 cursor-pointer items-center justify-between gap-3 rounded-xl border p-3 text-left hover:bg-muted/50"
										key={accountId}
										onClick={() => setAccountId(accountId)}
										type="button"
									>
										<span className="min-w-0">
											<span className="block truncate font-medium">
												{accountNames.get(accountId) ?? entries[0]?.name ?? "Conta"}
											</span>
											<span className="text-muted-foreground text-sm">
												{entries.length} {entries.length === 1 ? "ajuste" : "ajustes"}
												{entries[0] ? ` · Último em ${formatLocalDate(entries[0].date)}` : ""}
											</span>
										</span>
										<LuChevronRight className="shrink-0" />
									</button>
								))}
						</div>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button
						className="cursor-pointer disabled:cursor-not-allowed"
						disabled={!adjustmentsQuery.isSuccess || !accountsQuery.isSuccess}
						onClick={() => setEditing("new")}
					>
						<LuPlus /> Novo ajuste
					</Button>
				</DialogFooter>
			</DialogContent>
			{open && accountId !== null ? (
				<AccountAdjustmentsDialog
					entries={groups.find(([id]) => id === accountId)?.[1] ?? []}
					isPending={id => !!pending[`${identity}:balance-adjustment:${id}`]}
					name={
						accountNames.get(accountId) ?? groups.find(([id]) => id === accountId)?.[1][0]?.name ?? "Conta"
					}
					onAdd={() => {
						setRecoveredDraft({ adjustment: null, balance: "", date: "", financialAccountId: accountId });
						setEditing("new");
					}}
					onClose={() => setAccountId(null)}
					onEdit={adjustment => {
						setRecoveredDraft(null);
						setEditing(adjustment);
					}}
					onRemove={remove}
				>
					{form}
				</AccountAdjustmentsDialog>
			) : (
				form
			)}
		</Dialog>
	);
}
