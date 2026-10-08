import {
	AccountsController,
	BalanceAdjustmentsController,
	FinancialAccountYieldHolidaysController,
	FinancialAccountYieldsController,
	InstitutionsController,
} from "./modules/accounts/infra";
import { CategoriesController } from "./modules/categories/infra";
import { CreditCardImportsController } from "./modules/credit-card-imports/infra";
import { CreditCardsController } from "./modules/creditCards/infra";
import { CurrenciesController } from "./modules/currencies/infra/CurrenciesController";
import { DashboardController } from "./modules/dashboard/infra";
import { DebtsController } from "./modules/debts/infra";
import { FinancialHistoryController } from "./modules/financial-history/infra/FinancialHistoryController";
import { LoansController } from "./modules/loans/infra";
import { OpenFinanceController } from "./modules/open-finance/infra/OpenFinanceController";
import { RecurringController } from "./modules/recurring/infra";
import { ReferenceRateController } from "./modules/reference-rates/infra/ReferenceRateController";
import { StoresController } from "./modules/stores/infra";
import { SyncController } from "./modules/sync";
import { TransactionImportsController } from "./modules/transaction-imports/infra";
import { TransactionsController } from "./modules/transactions/infra";
import { UpgradeController } from "./modules/upgrades/UpgradeController";
import { app } from "./shared/infra/elysia";

export const server = app.use([
	FinancialHistoryController,
	CurrenciesController,
	ReferenceRateController,
	OpenFinanceController,
	AccountsController,
	BalanceAdjustmentsController,
	InstitutionsController,
	FinancialAccountYieldHolidaysController,
	FinancialAccountYieldsController,
	TransactionsController,
	TransactionImportsController,
	CreditCardImportsController,
	CreditCardsController,
	LoansController,
	DebtsController,
	RecurringController,
	CategoriesController,
	StoresController,
	DashboardController,
	SyncController,
	UpgradeController,
]);
