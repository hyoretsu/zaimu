import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { endOfMonth, format, startOfMonth } from "date-fns";
import { useState } from "react";
import { LuArrowDownLeft, LuArrowUpRight, LuTrendingUp } from "react-icons/lu";
import {
	CreditCardImportReviewDialog,
	PendingCreditCardImportsNotice,
} from "@/components/credit-card-imports";
import {
	PendingTransactionImportsNotice,
	TransactionImportReviewDialog,
} from "@/components/transaction-imports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type AuthState, useAuthStore } from "@/stores";
import {
	DashboardAccounts,
	DashboardComparisonChart,
	DashboardCreditCards,
	DashboardDateFilter,
	DashboardDebts,
	DashboardForecasts,
	DashboardQuickActions,
	DashboardSkeleton,
} from "./components";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function DashboardPage() {
	const user = useAuthStore((state: AuthState) => state.user);
	const identity = useCacheIdentity();
	const [dateRange, setDateRange] = useState<DateRangeValue>(() => getCurrentMonthRange());
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [reviewingCreditCardImportId, setReviewingCreditCardImportId] = useState<string | null>(null);
	const dashboardQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.dashboard.get(dateRange),
		queryKey: queryKeys.dashboard.detail(identity!, dateRange),
	});
	if (dashboardQuery.isPending) return <DashboardSkeleton />;
	if (dashboardQuery.isError || !dashboardQuery.data)
		return (
			<PageContainer>
				<EmptyState
					description="Não foi possível atualizar seus dados agora."
					icon={<LuTrendingUp />}
					title="Painel indisponível"
				/>
			</PageContainer>
		);
	const dashboard = dashboardQuery.data;
	const endingBalance = dashboard.period.initialBalance + dashboard.period.net;
	return (
		<PageContainer className="space-y-6">
			<PageHeader
				actions={
					<div className="flex flex-wrap items-center justify-end gap-2">
						<DashboardDateFilter onChange={setDateRange} value={dateRange} />
						<DashboardQuickActions />
					</div>
				}
				description="Seu dinheiro, compromissos e próximos passos em um só lugar."
				eyebrow={`Olá, ${user?.name?.split(" ")[0] || "visitante"}`}
				title="Visão geral"
			/>
			<PendingTransactionImportsNotice onReview={setReviewingImportId} />
			<PendingCreditCardImportsNotice onReview={setReviewingCreditCardImportId} />
			<section className="grid gap-4 sm:grid-cols-2 xl:grid-cols-3">
				<Card className="border-0 bg-primary text-primary-foreground shadow-primary/15 shadow-xl sm:col-span-2 xl:col-span-1">
					<CardHeader>
						<CardTitle className="font-medium text-primary-foreground/75 text-sm">
							Saldo final do período
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-bold text-3xl tracking-tight">{currency.format(endingBalance)}</p>
						<p className="mt-3 text-primary-foreground/70 text-xs">
							Saldo inicial: {currency.format(dashboard.period.initialBalance)}
						</p>
					</CardContent>
				</Card>
				<Card className="border-0 bg-brand-yellow text-brand-ink shadow-brand-yellow/20 shadow-xl">
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-medium text-sm">
							<LuArrowDownLeft /> Entradas do período
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-bold text-3xl tracking-tight">{currency.format(dashboard.period.income)}</p>
					</CardContent>
				</Card>
				<Card>
					<CardHeader>
						<CardTitle className="flex items-center gap-2 font-medium text-muted-foreground text-sm">
							<LuArrowUpRight /> Saídas do período
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-bold text-3xl tracking-tight">{currency.format(dashboard.period.expenses)}</p>
						<p
							className={`mt-3 font-semibold text-xs ${dashboard.period.net >= 0 ? "text-emerald-600" : "text-rose-600"}`}
						>
							Resultado: {currency.format(dashboard.period.net)}
						</p>
					</CardContent>
				</Card>
			</section>
			<DashboardComparisonChart comparison={dashboard.comparison} />
			<section className="grid gap-4 xl:grid-cols-2">
				<DashboardAccounts accounts={dashboard.accounts} />
				<DashboardCreditCards
					creditCards={dashboard.creditCards}
					totalAvailableCredit={dashboard.totalAvailableCredit}
				/>
				<DashboardForecasts forecasts={dashboard.forecasts} />
				<DashboardDebts debts={dashboard.debts} />
			</section>
			<TransactionImportReviewDialog
				importId={reviewingImportId}
				onOpenChange={nextOpen => !nextOpen && setReviewingImportId(null)}
				open={reviewingImportId !== null}
			/>
			<CreditCardImportReviewDialog
				importId={reviewingCreditCardImportId}
				onOpenChange={nextOpen => !nextOpen && setReviewingCreditCardImportId(null)}
				open={reviewingCreditCardImportId !== null}
			/>
		</PageContainer>
	);
}

function getCurrentMonthRange() {
	const now = new Date();
	return {
		endDate: format(endOfMonth(now), "yyyy-MM-dd"),
		startDate: format(startOfMonth(now), "yyyy-MM-dd"),
	};
}

export const Route = createFileRoute("/")({ component: DashboardPage });
