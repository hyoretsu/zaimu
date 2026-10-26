import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuEye, LuFileUp, LuLandmark, LuPlus, LuScale, LuSettings2, LuWalletCards } from "react-icons/lu";
import { NativeMoneyTotals } from "@/components/currency/NativeMoneyTotals";
import { PendingNotices } from "@/components/pending-notices";
import { ImportTransactionsDialog, TransactionImportReviewDialog } from "@/components/transaction-imports";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { QueryRefreshStatus } from "@/components/ui/QueryRefreshStatus";
import { Skeleton } from "@/components/ui/Skeleton";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { useModalRecoveryStore } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByTitle,
	getFinancialAccountCurrencyValue,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { getFinancialInstitutions } from "@/lib/financial-institution";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	AccountDefaultsDialog,
	BalanceAdjustmentsDialog,
	CreateFinancialAccountDialog,
	FinancialInstitutionGroup,
} from "@/routes/accounts/components";
import { showToast, useAuthStore } from "@/stores";
import type { AccountDefaultsDraft } from "./AccountDefaultsForm";

export function AccountsPage() {
	const [isImportOpen, setIsImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [isDefaultsOpen, setIsDefaultsOpen] = useState(false);
	const [recoveredDefaults, setRecoveredDefaults] = useState<AccountDefaultsDraft | null>(null);
	const identity = useCacheIdentity();
	const defaultsPending = useModalRecoveryStore(state => !!state.pending[`${identity}:account-defaults`]);
	useBackgroundModalRecovery<AccountDefaultsDraft>("account-defaults", entry => {
		setRecoveredDefaults(entry.payload);
		setIsDefaultsOpen(true);
	});
	const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
	const [isBalanceAdjustmentsOpen, setIsBalanceAdjustmentsOpen] = useState(false);
	const queryClient = useQueryClient();
	const hasAccess = useAuthStore(state => state.isAuthenticated || state.isGuestMode);
	const accounts = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.accounts.getAllIncludingHidden(),
		queryKey: [...queryKeys.accounts.list(identity!), "including-hidden"],
	});

	const guest = useAuthStore(state => state.isGuestMode);
	const catalog = useQuery({
		enabled: hasAccess && !guest,
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["institutions", identity],
	});
	const selectableInstitutions = [
		...new Map(
			[...getFinancialInstitutions(accounts.data ?? []), ...(catalog.data ?? [])].map(item => [
				item.id,
				item,
			]),
		).values(),
	];

	const createAccount = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: dataService.accounts.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Conta cadastrada.", "positive");
		},
	});
	const deleteAccount = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: dataService.accounts.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Conta excluída.", "positive");
		},
	});
	const updateAccount = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: ({ data, id }: { id: string; data: Parameters<typeof dataService.accounts.update>[1] }) =>
			dataService.accounts.update(id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Conta atualizada.", "positive");
		},
	});
	const setAccountHidden = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
			dataService.accounts.update(id, { isHidden }),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async account => {
			showToast(account.isHidden ? "Conta escondida." : "Conta exibida novamente.", "positive");
		},
	});

	const deleteInstitution = useMutation({
		meta: { cacheOperations: ["institution"] },
		mutationFn: dataService.financialInstitutions.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast("Instituição excluída.", "positive");
		},
	});

	const visibleAccounts = useMemo(
		() => accounts.data?.filter(account => account.type !== "CREDIT_CARD" && !account.isHidden) ?? [],
		[accounts.data],
	);
	const rewardAccounts = visibleAccounts.filter(account => account.type === "REWARDS");
	const hiddenAccounts = accounts.data?.filter(account => account.isHidden) ?? [];
	const organization = useMemo(() => {
		const allAccounts = visibleAccounts;
		const institutions = getFinancialInstitutions(accounts.data ?? []);
		const groups: Array<{ accounts: FinancialAccount[]; institution: FinancialInstitution | null }> =
			institutions
				.map(institution => ({
					accounts: allAccounts
						.filter(account => account.institutionId === institution.id)
						.toSorted(compareFinancialAccountsByTitle),
					institution,
				}))
				.filter(group => group.accounts.length > 0);
		const unassigned = allAccounts
			.filter(account => !account.institutionId)
			.toSorted(compareFinancialAccountsByTitle);
		if (unassigned.length) groups.push({ accounts: unassigned, institution: null });
		return { groups, institutions };
	}, [accounts.data, visibleAccounts]);

	return (
		<PageContainer className="grid gap-8">
			<PageHeader
				actions={[
					{
						disabled: defaultsPending,
						icon: LuSettings2,
						label: "Contas padrão",
						onClick: () => setIsDefaultsOpen(true),
					},
					{ icon: LuFileUp, label: "Importar extrato", onClick: () => setIsImportOpen(true) },
					{
						icon: LuScale,
						label: "Ajustes de saldo",
						onClick: () => setIsBalanceAdjustmentsOpen(true),
					},
					{
						icon: LuPlus,
						label: "Nova conta",
						onClick: () => setIsCreateAccountOpen(true),
						variant: "default",
					},
				]}
				description="Organize contas bancárias, dinheiro, investimentos e recompensas."
				subtitle="Patrimônio"
				title="Contas financeiras"
			/>
			<PendingNotices onReviewTransactionImport={setReviewingImportId} />
			<ImportTransactionsDialog
				onImported={setReviewingImportId}
				onOpenChange={setIsImportOpen}
				open={isImportOpen}
			/>
			<TransactionImportReviewDialog
				importId={reviewingImportId}
				onOpenChange={open => !open && setReviewingImportId(null)}
				open={reviewingImportId !== null}
			/>
			<CreateFinancialAccountDialog
				institutions={selectableInstitutions}
				onCreate={async data => {
					await createAccount.mutateAsync(data);
				}}
				onOpenChange={setIsCreateAccountOpen}
				open={isCreateAccountOpen}
				pending={false}
				rewardAccounts={rewardAccounts}
				showTrigger={false}
			/>
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="bg-brand-indigo shadow-card rounded-2xl p-5 text-white">
					<p className="text-sm text-white/70">Saldo total</p>
					<NativeMoneyTotals
						error={accounts.isError && accounts.data === undefined}
						pending={accounts.isPending}
						values={visibleAccounts.map(account => ({
							amount: getFinancialAccountCurrencyValue(account),
							currency: account.currency ?? "BRL",
						}))}
					/>
				</div>
				<div className="bg-brand-yellow text-brand-ink shadow-card rounded-2xl border p-5">
					<p className="text-brand-ink/65 text-sm">Contas cadastradas</p>
					<p className="mt-2 text-3xl font-bold">{visibleAccounts.length}</p>
				</div>
			</section>
			<QueryRefreshStatus
				error={accounts.isError && accounts.data !== undefined}
				onRetry={() => accounts.refetch()}
				pending={accounts.isFetching && !accounts.isPending}
			/>
			{accounts.isPending ? (
				<div className="grid gap-6">
					{[1, 2].map(item => (
						<Skeleton className="h-64" key={item} />
					))}
				</div>
			) : accounts.isError && accounts.data === undefined ? (
				<EmptyState
					description="Tente novamente em instantes."
					icon={<LuLandmark className="size-6" />}
					title="Não foi possível carregar suas contas"
				/>
			) : visibleAccounts.length ? (
				<section className="grid gap-6">
					{organization.groups.map(group => (
						<FinancialInstitutionGroup
							accounts={group.accounts}
							institution={group.institution}
							institutions={selectableInstitutions}
							key={group.institution?.id ?? "unassigned"}
							onCreate={async data => {
								await createAccount.mutateAsync(data);
							}}
							onDelete={account => deleteAccount.mutateAsync(account.id)}
							onDeleteInstitution={institution => deleteInstitution.mutateAsync(institution.id)}
							onHide={account => setAccountHidden.mutate({ id: account.id, isHidden: true })}
							onUpdate={(id, data) => updateAccount.mutateAsync({ data, id })}
							pending={false}
							rewardAccounts={rewardAccounts}
						/>
					))}
				</section>
			) : (
				<EmptyState
					action={
						<CreateFinancialAccountDialog
							onCreate={async data => {
								await createAccount.mutateAsync(data);
							}}
							pending={false}
						/>
					}
					description="Comece cadastrando sua conta principal."
					icon={<LuWalletCards className="size-7" />}
					title={hiddenAccounts.length ? "Nenhuma conta visível" : "Nenhuma conta cadastrada"}
				/>
			)}
			{hiddenAccounts.length > 0 && (
				<section className="grid gap-3">
					<h2 className="text-lg font-bold">Contas escondidas</h2>
					{hiddenAccounts.map(account => (
						<div
							className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3"
							key={account.id}
						>
							<span className="truncate">{getFinancialAccountOptionLabel(account)}</span>
							<Button
								className="cursor-pointer"
								disabled={
									setAccountHidden.isPending &&
									setAccountHidden.variables?.id === account.id
								}
								onClick={() => setAccountHidden.mutate({ id: account.id, isHidden: false })}
								size="sm"
								variant="outline"
							>
								<LuEye /> Mostrar
							</Button>
						</div>
					))}
				</section>
			)}
			{isDefaultsOpen && (
				<AccountDefaultsDialog
					initialDraft={recoveredDefaults ?? undefined}
					onOpenChange={open => {
						setIsDefaultsOpen(open);
						if (!open) setRecoveredDefaults(null);
					}}
				/>
			)}
			<BalanceAdjustmentsDialog
				onOpenChange={setIsBalanceAdjustmentsOpen}
				open={isBalanceAdjustmentsOpen}
			/>
		</PageContainer>
	);
}
