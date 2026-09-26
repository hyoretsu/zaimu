#!/usr/bin/env -S node
import { Migration, MigrationCLI } from "@prisma/orm-postgres/migration";
import type { Contract as End } from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract";
import endContract from "../../snapshots/80b37abf58248afcee901da13623ce21a3bcd21891ed379c47f319b05416f04f/contract.json" with {
	type: "json",
};
import type { Contract as Start } from "../../snapshots/e9fb01d490bedf38a3e09337c235076db774e4cd163c7c06aa057f8f8a24372d/contract";
import startContract from "../../snapshots/e9fb01d490bedf38a3e09337c235076db774e4cd163c7c06aa057f8f8a24372d/contract.json" with {
	type: "json",
};

export default class M extends Migration<Start, End> {
	override readonly startContractJson = startContract;
	override readonly endContractJson = endContract;

	override get operations() {
		return [
			this.dropIndex({
				index: "DebtEvent_connectionId_date_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.dropIndex({
				index: "DebtEvent_debtPersonId_date_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["connectionId", "date", "id"],
				index: "DebtEvent_connectionId_date_id_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["debtPersonId", "date", "id"],
				index: "DebtEvent_debtPersonId_date_id_idx",
				schema: "public",
				table: "DebtEvent",
			}),
			this.createIndex({
				columns: ["userId", "hiddenAt", "name", "id"],
				index: "DebtPerson_userId_hiddenAt_name_id_idx",
				schema: "public",
				table: "DebtPerson",
			}),
			this.createIndex({
				columns: ["userId", "startDate", "id"],
				index: "Loan_userId_startDate_id_idx",
				schema: "public",
				table: "Loan",
			}),
			this.createIndex({
				columns: ["loanId", "changedAt", "id"],
				index: "LoanHistory_loanId_changedAt_id_idx",
				schema: "public",
				table: "LoanHistory",
			}),
			this.createIndex({
				columns: ["loanId", "installmentNumber"],
				extras: { unique: true },
				index: "LoanPayment_loanId_installmentNumber_key",
				schema: "public",
				table: "LoanPayment",
			}),
			this.createIndex({
				columns: ["loanId", "paidDate"],
				index: "LoanPayment_loanId_paidDate_idx",
				schema: "public",
				table: "LoanPayment",
			}),
			this.createIndex({
				columns: ["userId", "isActive", "name", "id"],
				index: "RecurringPayment_userId_active_name_id_idx",
				schema: "public",
				table: "RecurringPayment",
			}),
			this.createIndex({
				columns: ["recurringPaymentId", "changedAt", "id"],
				index: "RecurringPaymentHistory_paymentId_changedAt_id_idx",
				schema: "public",
				table: "RecurringPaymentHistory",
			}),
			this.createIndex({
				columns: ["userId", "isActive", "source", "id"],
				index: "Salary_userId_active_source_id_idx",
				schema: "public",
				table: "Salary",
			}),
			this.createIndex({
				columns: ["salaryId", "changedAt", "id"],
				index: "SalaryHistory_salaryId_changedAt_id_idx",
				schema: "public",
				table: "SalaryHistory",
			}),
			this.createIndex({
				columns: ["userId", "isActive", "name", "id"],
				index: "Subscription_userId_active_name_id_idx",
				schema: "public",
				table: "Subscription",
			}),
			this.createIndex({
				columns: ["subscriptionId", "changedAt", "id"],
				index: "SubscriptionHistory_subscriptionId_changedAt_id_idx",
				schema: "public",
				table: "SubscriptionHistory",
			}),
		];
	}
}

MigrationCLI.run(import.meta.url, M);
