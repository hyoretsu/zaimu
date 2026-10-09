import { useQuery } from "@tanstack/react-query";
import { format, startOfMonth } from "date-fns";
import { useState } from "react";
import { LuTrendingUp, LuWalletCards } from "react-icons/lu";
import { CreditCardImportReviewDialog } from "@/components/credit-card-imports";
import { HistoryCollectionProgress, TravelCurrencyBanner } from "@/components/currency";
import { PendingNotices } from "@/components/pending-notices";
import { TransactionImportReviewDialog } from "@/components/transaction-imports";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";
import { EmptyState } from "@/components/ui/EmptyState";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import {
	DashboardAccounts,
	DashboardComparisonChart,
	DashboardCreditCards,
	DashboardDateFilter,
	DashboardDebts,
	DashboardForecasts,
	DashboardPeriodFlowCard,
	DashboardProjectedCashFlowCard,
	DashboardQuickActions,
	DashboardReferenceRateNotice,
	DashboardSkeleton,
} from "@/routes/components";
import { type AuthState, useAuthStore } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";

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
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const currencyReady = useCurrencyStore(state => !state.loading && state.owner === identity);
	const dashboardQuery = useQuery({
		enabled: identity !== null && currencyReady,
		queryFn: () => dataService.dashboard.get(dashboardRange),
		queryKey: queryKeys.dashboard.detail(identity!, dashboardRange),
		refetchInterval: query =>
			query.state.data?.consolidation?.histories.some(
				history => history.state === "PENDING" || history.state === "RUNNING",
			)
				? 10_000
				: false,
	});
	if (!currencyReady || dashboardQuery.isPending) return <DashboardSkeleton />;
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
	const currencyCode = dashboard.currency ?? effectiveCurrency;
	const currency = new Intl.NumberFormat(navigator.languages, { currency: currencyCode, style: "currency" });
	const { accountBalance, fixedIncomeBalance, variableIncomeBalance } = dashboard.balanceBreakdown ?? {};
	const endingBalance = dashboard.period?.endingBalance;
	const isCurrentDay = isToday;
	const projectedCashFlow = dashboard.projectedCashFlowUntilMonthEnd;
	return (
		<PageContainer className="space-y-6">
			<TravelCurrencyBanner />
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
			<PendingNotices
				debtInvitations
				onReviewCreditCardImport={setReviewingCreditCardImportId}
				onReviewTransactionImport={setReviewingImportId}
				paymentSuggestions
			/>
			{dashboard.period && dashboard.balanceBreakdown ? (
				<section className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-rows-[auto_auto]">
					<Card className="gap-3 border-0 bg-primary py-4 text-primary-foreground shadow-primary/15 shadow-xl [--card-spacing:--spacing(4)] sm:gap-6 sm:py-6 xl:row-span-2 sm:[--card-spacing:--spacing(6)]">
						<CardHeader>
							<CardTitle className="flex items-start gap-2 font-medium text-primary-foreground text-xs sm:text-sm">
								<LuWalletCards aria-hidden="true" className="mt-0.5 size-4 shrink-0" />
								<span>{isCurrentDay ? "Saldo atual" : "Saldo final do período"}</span>
							</CardTitle>
						</CardHeader>
						<CardContent>
							<p className="font-bold text-2xl tracking-tight sm:text-3xl">
								{currency.format(endingBalance!)}
							</p>
							<div className="mt-2 space-y-0.5 text-primary-foreground text-xs sm:mt-3 sm:space-y-1">
								<p>Em conta: {currency.format(accountBalance!)}</p>
								<p>Renda fixa: {currency.format(fixedIncomeBalance!)}</p>
								<p>Renda variável: {currency.format(variableIncomeBalance!)}</p>
								<p>
									{isCurrentDay
										? "Sem projeções futuras."
										: `Saldo inicial: ${currency.format(dashboard.period.initialBalance)}`}
								</p>
							</div>
						</CardContent>
					</Card>
					<DashboardPeriodFlowCard
						currencyCode={currencyCode}
						expenses={dashboard.period.expenses}
						income={dashboard.period.income}
						isCurrentMonth={isToday}
						net={dashboard.period.net}
						recurringExpenses={dashboard.period.recurringExpenses}
						recurringIncome={dashboard.period.recurringIncome}
					/>
					{projectedCashFlow ? (
						<DashboardProjectedCashFlowCard
							currencyCode={currencyCode}
							expenses={projectedCashFlow.expenses}
							income={projectedCashFlow.income}
							net={projectedCashFlow.net}
						/>
					) : (
						<Card>
							<CardContent className="py-6 text-muted-foreground text-sm">
								Fluxo previsto aguarda histórico cambial.
							</CardContent>
						</Card>
					)}
				</section>
			) : (
				<Card>
					<CardContent className="py-6 text-muted-foreground text-sm">
						Consolidação em {currencyCode} indisponível enquanto faltam cotações. Saldos nativos continuam
						disponíveis abaixo.
					</CardContent>
				</Card>
			)}
			{dashboard.consolidation?.histories.map(history => (
				<HistoryCollectionProgress
					collectionId={history.collectionId}
					key={history.collectionId}
					title={`Histórico cambial - ${currencyCode}`}
				/>
			))}
			{dashboard.consolidation?.histories.some(history => history.state !== "COMPLETED") && (
				<p className="text-muted-foreground text-sm">
					Estimativa cambial parcial. Média ponderada dá maior peso às cotações recentes.
				</p>
			)}
			{dashboard.consolidation && (
				<p className="text-muted-foreground text-xs">
					Cotações atuais:{" "}
					{Object.entries(dashboard.consolidation.publishedDates)
						.map(([source, date]) => `${source}: ${date}`)
						.join("; ") || "Sem conversão necessária"}
				</p>
			)}
			<DashboardReferenceRateNotice available={dashboard.referenceRatesAvailable} />
			<DashboardComparisonChart />
			<section className="grid gap-4 xl:grid-cols-2">
				<DashboardAccounts
					accounts={dashboard.accounts}
					endDate={dashboard.nativeAsOf ?? dashboard.period?.endDate ?? today}
				/>
				<DashboardCreditCards
					creditCards={dashboard.creditCards}
					currencyCode={currencyCode}
					totalAvailableCredit={dashboard.totalAvailableCredit}
				/>
				{dashboard.consolidation?.unavailable || dashboard.consolidation?.forecastAvailable === false ? (
					<Card>
						<CardContent className="py-6 text-muted-foreground text-sm">
							Previsões consolidadas aguardam cotações.
						</CardContent>
					</Card>
				) : (
					<DashboardForecasts currencyCode={currencyCode} forecasts={dashboard.forecasts} />
				)}
				{dashboard.debts && <DashboardDebts currencyCode={currencyCode} debts={dashboard.debts} />}
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
