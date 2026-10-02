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
import { DashboardController } from "./modules/dashboard/infra";
import { DebtsController } from "./modules/debts/infra";
import { LoansController } from "./modules/loans/infra";
import { RecurringController } from "./modules/recurring/infra";
import { StoresController } from "./modules/stores/infra";
import { SyncController } from "./modules/sync";
import { TransactionImportsController } from "./modules/transaction-imports/infra";
import { TransactionsController } from "./modules/transactions/infra";
import { UpgradeController } from "./modules/upgrades/UpgradeController";
import { app } from "./shared/infra/elysia";

export const server = app.use([
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
