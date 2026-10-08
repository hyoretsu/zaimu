import { expect, spyOn, test } from "bun:test";

test("guest chart reads no dashboard or debt data and repeats selected dates", async () => {
	const originalWindow = Object.getOwnPropertyDescriptor(globalThis, "window");
	if (!originalWindow)
		Object.defineProperty(globalThis, "window", {
			configurable: true,
			value: { location: { origin: "http://localhost" } },
		});
	const { dataService } = await import("../dataService");
	const currencyContext = await import("../currency-context");
	const previousCurrency = currencyContext.activeCurrency();
	currencyContext.setActiveCurrency("BRL");
	const { getGuestDashboardComparison } = await import("../dashboard-comparison");
	const stores = await import("../localStorage");
	const rates = await import("../reference-rate-averages");
	const cardForecast = await import("@zaimu/finance/card-forecast");
	const mocks = [
		spyOn(rates, "refreshReferenceRateAverages").mockResolvedValue(null),
		spyOn(cardForecast, "recurringCardPaymentAmounts").mockReturnValue(new Map([["payment", 20]])),
		spyOn(stores.localAccounts, "getAll").mockResolvedValue([
			{
				data: {
					balance: 0,
					createdAt: "2026-01-01",
					id: "checking",
					institutionId: null,
					name: "Conta",
					type: "CHECKING",
					updatedAt: "2026-01-01",
					userId: "guest",
				},
			},
		] as never),
		spyOn(dataService.transactions, "getAll").mockResolvedValue([
			{ amount: 100, date: "2026-01-05", destinationFinancialAccountId: "checking", type: "INCOME" },
			{
				amount: 50,
				date: "2026-01-06",
				id: "payment",
				originFinancialAccountId: "checking",
				paymentCreditCardId: "card",
				recurrenceId: "payment-recurrence",
				type: "EXPENSE",
			},
		] as never),
		spyOn(dataService.recurrences, "getAll").mockResolvedValue([]),
		spyOn(dataService.creditCards, "getAll").mockResolvedValue([]),
		spyOn(stores.localCreditBooks, "getAll").mockResolvedValue([{ data: {} }] as never),
		spyOn(await import("@zaimu/finance/credit-book"), "creditBookRewards").mockReturnValue([]),
		spyOn(stores.localLoanPayments, "getAll").mockResolvedValue([]),
		spyOn(stores.localRecurrenceOccurrences, "getAll").mockResolvedValue([]),
		spyOn(stores.localMeta, "get").mockResolvedValue(null),
	];
	const dashboard = spyOn(dataService.dashboard, "get");
	const debts = spyOn(dataService.debts, "getLedger");
	try {
		const result = await getGuestDashboardComparison({
			endDate: "2026-01-16",
			periodsAfter: 1,
			periodsBefore: 1,
			startDate: "2026-01-03",
		});
		expect(result.map(item => [item.startDate, item.endDate])).toEqual([
			["2025-12-20", "2026-01-02"],
			["2026-01-03", "2026-01-16"],
			["2026-01-17", "2026-01-30"],
		]);
		expect(result[1]).toMatchObject({
			accountBalance: 50,
			cardExpenses: 50,
			endingBalance: 50,
			expenses: 50,
			income: 100,
			initialBalance: 0,
			recurringCardExpenses: 20,
			recurringExpenses: 20,
			savingsBalance: 0,
		});
		expect(result[2]).toMatchObject({ endingBalance: 50, initialBalance: 50 });
		expect(dashboard).not.toHaveBeenCalled();
		expect(debts).not.toHaveBeenCalled();
	} finally {
		currencyContext.setActiveCurrency(previousCurrency);
		for (const mock of mocks) mock.mockRestore();
		dashboard.mockRestore();
		debts.mockRestore();
		if (!originalWindow) Reflect.deleteProperty(globalThis, "window");
	}
});
