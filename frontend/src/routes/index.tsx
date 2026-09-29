import { useQuery } from "@tanstack/react-query";
import { createFileRoute } from "@tanstack/react-router";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { LuTrendingUp, LuWalletCards } from "react-icons/lu";
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
	DashboardDebtInvitations,
	DashboardDebts,
	DashboardForecasts,
	DashboardPeriodFlowCard,
	DashboardProjectedCashFlowCard,
	DashboardQuickActions,
	DashboardSkeleton,
} from "./components";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function DashboardPage() {
	const user = useAuthStore((state: AuthState) => state.user);
	const identity = useCacheIdentity();
	const [dateRange, setDateRange] = useState<DateRangeValue>(() => getTodayRange());
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const [reviewingCreditCardImportId, setReviewingCreditCardImportId] = useState<string | null>(null);
	const today = format(new Date(), "yyyy-MM-dd");
	const isToday = dateRange.startDate === today && dateRange.endDate === today;
	const dashboardRange = isToday
		? { ...dateRange, startDate: format(startOfMonth(new Date()), "yyyy-MM-dd") }
		: dateRange;
	const dashboardQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.dashboard.get(dashboardRange),
		queryKey: queryKeys.dashboard.detail(identity!, dashboardRange),
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
	const { accountBalance, savingsBalance } = dashboard.balanceBreakdown;
	const endingBalance = dashboard.period.endingBalance;
	const isCurrentDay = isToday;
	const projectedCashFlow = dashboard.projectedCashFlowUntilMonthEnd;
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
			<DashboardDebtInvitations />
			<section className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-rows-[auto_auto]">
				<Card className="gap-3 border-0 bg-primary py-4 text-primary-foreground shadow-primary/15 shadow-xl [--card-spacing:--spacing(4)] sm:gap-6 sm:py-6 xl:row-span-2 sm:[--card-spacing:--spacing(6)]">
					<CardHeader>
						<CardTitle className="flex items-start gap-2 font-medium text-primary-foreground text-xs sm:text-sm">
							<LuWalletCards aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
							<span>{isCurrentDay ? "Saldo atual" : "Saldo final do período"}</span>
						</CardTitle>
					</CardHeader>
					<CardContent>
						<p className="font-bold text-2xl tracking-tight sm:text-3xl">{currency.format(endingBalance)}</p>
						<div className="mt-2 space-y-0.5 text-primary-foreground text-xs sm:mt-3 sm:space-y-1">
							<p>Em conta: {currency.format(accountBalance)}</p>
							<p>Poupanças: {currency.format(savingsBalance)}</p>
							<p>
								{isCurrentDay
									? "Sem projeções futuras."
									: `Saldo inicial: ${currency.format(dashboard.period.initialBalance)}`}
							</p>
						</div>
					</CardContent>
				</Card>
				<DashboardPeriodFlowCard
					expenses={dashboard.period.expenses}
					income={dashboard.period.income}
					isCurrentMonth={isToday}
					net={dashboard.period.net}
				/>
				<DashboardProjectedCashFlowCard
					expenses={projectedCashFlow.expenses}
					income={projectedCashFlow.income}
					net={projectedCashFlow.net}
				/>
			</section>
			<DashboardComparisonChart comparison={dashboard.comparison} />
			<section className="grid gap-4 xl:grid-cols-2">
				<DashboardAccounts accounts={dashboard.accounts} endDate={dashboard.period.endDate} />
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

function getTodayRange() {
	const now = new Date();
	return {
		endDate: format(now, "yyyy-MM-dd"),
		startDate: format(now, "yyyy-MM-dd"),
	};
}

export const Route = createFileRoute("/")({ component: DashboardPage });
