import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import {
	LuCalendarDays,
	LuEye,
	LuLandmark,
	LuPlus,
	LuScale,
	LuSettings2,
	LuWalletCards,
} from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount, FinancialAccountYieldHoliday, FinancialInstitution } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import {
	compareFinancialAccountsByTitle,
	getFinancialAccountCurrencyValue,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { getFinancialInstitutions } from "@/lib/financial-institution";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	AccountDefaultsDialog,
	BalanceAdjustmentsDialog,
	CreateFinancialAccountDialog,
	FinancialAccountYieldHolidaysDialog,
	FinancialInstitutionGroup,
} from "@/routes/accounts/components";
import { showToast, useAuthStore } from "@/stores";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function AccountsPage() {
	const [isDefaultsOpen, setIsDefaultsOpen] = useState(false);
	const [isCreateAccountOpen, setIsCreateAccountOpen] = useState(false);
	const [isHolidaysOpen, setIsHolidaysOpen] = useState(false);
	const [isBalanceAdjustmentsOpen, setIsBalanceAdjustmentsOpen] = useState(false);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const hasAccess = useAuthStore(state => state.isAuthenticated || state.isGuestMode);
	const accounts = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.accounts.getAllIncludingHidden(),
		queryKey: [...queryKeys.accounts.list(identity!), "including-hidden"],
	});
	const holidays = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.accountYieldHolidays.getAll(),
		queryKey: queryKeys.accountYieldHolidays.all(identity!),
	});
	const invalidateAccountData = () => invalidateCacheOperation(queryClient, identity!, "account");
	const createAccount = useMutation({
		mutationFn: dataService.accounts.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateAccountData();
			showToast("Conta cadastrada.", "positive");
		},
	});
	const deleteAccount = useMutation({
		mutationFn: dataService.accounts.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateAccountData();
			showToast("Conta excluída.", "positive");
		},
	});
	const updateAccount = useMutation({
		mutationFn: ({ data, id }: { id: string; data: Parameters<typeof dataService.accounts.update>[1] }) =>
			dataService.accounts.update(id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateAccountData();
			showToast("Conta atualizada.", "positive");
		},
	});
	const setAccountHidden = useMutation({
		mutationFn: ({ id, isHidden }: { id: string; isHidden: boolean }) =>
			dataService.accounts.update(id, { isHidden }),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async account => {
			await invalidateAccountData();
			showToast(account.isHidden ? "Conta escondida." : "Conta exibida novamente.", "positive");
		},
	});
	const updateInstitution = useMutation({
		mutationFn: ({
			data,
			id,
		}: {
			data: Parameters<typeof dataService.financialInstitutions.update>[1];
			id: string;
		}) => dataService.financialInstitutions.update(id, data),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateAccountData();
			showToast("Instituição atualizada.", "positive");
		},
	});
	const createHoliday = useMutation({
		mutationFn: dataService.accountYieldHolidays.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "holiday");
			showToast("Feriado marcado. Rendimentos recalculados.", "positive");
		},
	});
	const deleteHoliday = useMutation({
		mutationFn: dataService.accountYieldHolidays.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "holiday");
			showToast("Feriado removido. Rendimentos recalculados.", "positive");
		},
	});
	const deleteInstitution = useMutation({
		mutationFn: dataService.financialInstitutions.delete,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "institution");
			showToast("Instituição excluída.", "positive");
		},
	});
	const totalBalance =
		accounts.data
			?.filter(account => account.type !== "CREDIT_CARD" && !account.isHidden)
			.reduce((sum, account) => sum + getFinancialAccountCurrencyValue(account), 0) ?? 0;
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
				actions={
					<ActionGroup>
						<Button className="h-11 cursor-pointer" onClick={() => setIsDefaultsOpen(true)} variant="outline">
							<LuSettings2 /> Contas padrão
						</Button>
						<Button
							className="h-11 cursor-pointer"
							onClick={() => setIsBalanceAdjustmentsOpen(true)}
							variant="outline"
						>
							<LuScale /> Ajustes de saldo
						</Button>
						<FinancialAccountYieldHolidaysDialog
							holidays={holidays.data ?? ([] as FinancialAccountYieldHoliday[])}
							onCreate={date => createHoliday.mutateAsync(date)}
							onDelete={id => deleteHoliday.mutateAsync(id)}
							onOpenChange={setIsHolidaysOpen}
							open={isHolidaysOpen}
							pending={createHoliday.isPending || deleteHoliday.isPending}
						/>
						<CreateFinancialAccountDialog
							institutions={organization.institutions}
							onCreate={async data => {
								await createAccount.mutateAsync(data);
							}}
							onOpenChange={setIsCreateAccountOpen}
							open={isCreateAccountOpen}
							pending={false}
							rewardAccounts={rewardAccounts}
						/>
					</ActionGroup>
				}
				description="Organize contas bancárias, dinheiro, investimentos e recompensas."
				eyebrow="Patrimônio"
				mobileActions={[
					{ icon: LuSettings2, label: "Contas padrão", onClick: () => setIsDefaultsOpen(true) },
					{ icon: LuScale, label: "Ajustes de saldo", onClick: () => setIsBalanceAdjustmentsOpen(true) },
					{ icon: LuCalendarDays, label: "Feriados", onClick: () => setIsHolidaysOpen(true) },
					{ icon: LuPlus, label: "Nova conta", onClick: () => setIsCreateAccountOpen(true) },
				]}
				title="Contas financeiras"
			/>
			<section className="grid gap-4 sm:grid-cols-2">
				<div className="rounded-2xl bg-brand-indigo p-5 text-white shadow-card">
					<p className="text-sm text-white/70">Saldo total</p>
					<p className="mt-2 font-bold text-3xl">{currency.format(totalBalance)}</p>
				</div>
				<div className="rounded-2xl border bg-brand-yellow p-5 text-brand-ink shadow-card">
					<p className="text-brand-ink/65 text-sm">Contas cadastradas</p>
					<p className="mt-2 font-bold text-3xl">{visibleAccounts.length}</p>
				</div>
			</section>
			{accounts.isPending ? (
				<div className="grid gap-6">
					{[1, 2].map(item => (
						<Skeleton className="h-64" key={item} />
					))}
				</div>
			) : accounts.isError ? (
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
							institutions={organization.institutions}
							key={group.institution?.id ?? "unassigned"}
							onCreate={async data => {
								await createAccount.mutateAsync(data);
							}}
							onDelete={account => deleteAccount.mutateAsync(account.id)}
							onDeleteInstitution={institution => deleteInstitution.mutateAsync(institution.id)}
							onHide={account => setAccountHidden.mutate({ id: account.id, isHidden: true })}
							onUpdate={(id, data) => updateAccount.mutateAsync({ data, id })}
							onUpdateInstitution={(institution, name, currency) =>
								updateInstitution.mutateAsync({ data: { currency, name }, id: institution.id })
							}
							onUpdateInstitutionYield={(institution, yieldPolicy) =>
								updateInstitution.mutateAsync({ data: { yieldPolicy }, id: institution.id })
							}
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
					<h2 className="font-bold text-lg">Contas escondidas</h2>
					{hiddenAccounts.map(account => (
						<div
							className="flex items-center justify-between gap-3 rounded-xl border bg-card p-3"
							key={account.id}
						>
							<span className="truncate">{getFinancialAccountOptionLabel(account)}</span>
							<Button
								className="cursor-pointer"
								disabled={setAccountHidden.isPending && setAccountHidden.variables?.id === account.id}
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
			{isDefaultsOpen && <AccountDefaultsDialog onOpenChange={setIsDefaultsOpen} />}
			<BalanceAdjustmentsDialog onOpenChange={setIsBalanceAdjustmentsOpen} open={isBalanceAdjustmentsOpen} />
		</PageContainer>
	);
}
