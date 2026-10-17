import { t } from "elysia";
import { SyncReturn } from "~/modules/sync/SyncDTO";
import * as contracts from "./transport-contracts";

export const transportModels = contracts;

export const HttpErrorReturn = t.Object({ error: t.String() });

export const transportResponses = {
	"delete /balance-adjustments/{}": t.Object({
		success: t.Literal(true),
	}),
	"delete /categories/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /credit-card-imports/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /credit-cards/{}/purchases/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /credit-cards/{}/purchases/{}/refunds/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /financial-account-yield-holidays/{}": { 403: HttpErrorReturn },
	"delete /financial-account-yields/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /financial-accounts/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /transaction-imports/{}": t.Object({
		success: t.Boolean(),
	}),
	"delete /transactions/{}": t.Object({
		success: t.Boolean(),
	}),
	"get /balance-adjustments": t.Array(
		t.Object({
			balance: t.Number(),
			calculatedBalance: t.Number(),
			createdAt: t.String(),
			date: t.String(),
			financialAccountId: t.String(),
			id: t.String(),
			name: t.Union([t.Null(), t.String()]),
		}),
	),
	"get /categories": contracts.CategoryPageReturn,
	"get /categories/{}": t.Object({
		color: t.Union([t.Null(), t.String()]),
		createdAt: t.String(),
		icon: t.Union([t.Null(), t.String()]),
		id: t.String(),
		name: t.String(),
		parentId: t.Union([t.Null(), t.String()]),
		updatedAt: t.String(),
		userId: t.String(),
	}),
	"get /categories/lookup": t.Array(contracts.CategoryReturn),
	"get /credit-card-imports": t.Array(contracts.CreditCardImportSummaryReturn),
	"get /credit-card-imports/{}": contracts.CreditCardImportReturn,
	"get /credit-card-imports/{}/refund-sources": t.Array(
		t.Object({
			description: t.String(),
			id: t.String(),
			installments: t.Number(),
			purchaseDate: t.String(),
			refundableAmount: t.Number(),
			totalAmount: t.Number(),
		}),
	),
	"get /credit-cards": t.Array(contracts.CreditCardReturn),
	"get /credit-cards/{}": t.Object({
		accountName: t.String(),
		cashbackAccountId: t.Union([t.Null(), t.String()]),
		cashbackRate: t.Union([t.Null(), t.Number()]),
		cashbackYieldPeriod: t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")]),
		cashbackYieldReferencePercentage: t.Union([t.Null(), t.Number()]),
		cashbackYieldReferenceRate: t.Union([t.Null(), t.Number()]),
		createdAt: t.String(),
		creditLimit: t.Number(),
		dueDay: t.Number(),
		excludeFromTotals: t.Boolean(),
		financialAccountId: t.String(),
		id: t.String(),
		ignoreStatementsBefore: t.Union([t.Null(), t.String()]),
		paymentAccountId: t.Union([t.Null(), t.String()]),
		paymentSuggestionsEnabled: t.Boolean(),
		securityDeposit: t.Union([t.Null(), t.Number()]),
		statementDay: t.Number(),
		workingDueDate: t.Boolean(),
	}),
	"get /credit-cards/{}/book": t.Object({
		card: t.Object({
			currency: t.Optional(t.String()),
			dueDay: t.Number(),
			id: t.String(),
			ignoreStatementsBefore: t.Union([t.Null(), t.String()]),
			installmentRemainderOnFirst: t.Optional(t.Boolean()),
			institutionId: t.Union([t.Null(), t.String()]),
			refundPolicy: t.Union([
				t.Null(),
				t.Literal("KEEP_INSTALLMENTS"),
				t.Literal("CANCEL_FUTURE_INSTALLMENTS"),
			]),
			statementClosingInclusive: t.Optional(t.Boolean()),
			statementDay: t.Number(),
			userId: t.String(),
			workingDueDate: t.Optional(t.Boolean()),
		}),
		charges: t.Array(
			t.Object({
				amountCents: t.Number(),
				chargeDate: t.String(),
				description: t.String(),
				externalId: t.Union([t.Null(), t.String()]),
				id: t.String(),
				isSettled: t.Boolean(),
				settledByPurchaseId: t.Union([t.Null(), t.String()]),
				statementId: t.String(),
				time: t.Union([t.Null(), t.String()]),
			}),
		),
		deletedChargeIds: t.Optional(t.Array(t.String())),
		deletedPurchaseIds: t.Optional(t.Array(t.String())),
		installments: t.Array(
			t.Object({
				amountCents: t.Number(),
				hasImportedAmount: t.Boolean(),
				id: t.String(),
				isSettled: t.Optional(t.Boolean()),
				number: t.Number(),
				occurrenceDate: t.String(),
				purchaseId: t.String(),
				settledByPurchaseId: t.Union([t.Null(), t.String()]),
				statementId: t.String(),
			}),
		),
		payments: t.Array(
			t.Object({
				amount: t.Number(),
				date: t.String(),
				id: t.String(),
			}),
		),
		purchases: t.Array(
			t.Object({
				bookingCurrency: t.Optional(t.String()),
				cashbackAccountId: t.Union([t.Null(), t.String()]),
				cashbackAmount: t.Union([t.Null(), t.Number()]),
				cashbackCurrency: t.Optional(t.String()),
				cashbackYieldPeriod: t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")]),
				cashbackYieldReferencePercentage: t.Union([t.Null(), t.Number()]),
				cashbackYieldReferenceRate: t.Union([t.Null(), t.Number()]),
				createdAt: t.String(),
				creditCardId: t.String(),
				currency: t.Optional(t.String()),
				debtSplitRule: t.Optional(
					t.Union([
						t.Null(),
						t.Object({
							mode: t.Literal("SHARES"),
							ownerShares: t.Union([t.Null(), t.Number()]),
							participants: t.Array(
								t.Object({
									debtPersonId: t.String(),
									description: t.Optional(t.String()),
									shares: t.Number(),
								}),
							),
						}),
						t.Object({
							mode: t.Literal("PERCENTAGE"),
							ownerIncluded: t.Boolean(),
							participants: t.Array(
								t.Object({
									debtPersonId: t.String(),
									description: t.Optional(t.String()),
									percentage: t.Number(),
								}),
							),
							remainderDebtPersonId: t.Optional(t.String()),
						}),
						t.Object({
							mode: t.Literal("FIXED"),
							ownerIncluded: t.Boolean(),
							participants: t.Array(
								t.Object({
									debtPersonId: t.String(),
									description: t.Optional(t.String()),
									fixedAmount: t.Number(),
								}),
							),
							remainderDebtPersonId: t.Optional(t.String()),
						}),
					]),
				),
				description: t.String(),
				exchangeRate: t.Optional(t.Union([t.Null(), t.Number()])),
				externalId: t.Union([t.Null(), t.String()]),
				feeAmount: t.Union([t.Null(), t.Number()]),
				feeDescription: t.Union([t.Null(), t.String()]),
				fees: t.Optional(
					t.Array(
						t.Object({
							amount: t.Number(),
							name: t.String(),
							type: t.Union([t.Literal("PERCENTAGE"), t.Literal("FIXED")]),
						}),
					),
				),
				id: t.String(),
				installmentAmountsCents: t.Array(t.Number()),
				installmentImportedNumbers: t.Optional(t.Array(t.Number())),
				installmentStatementDates: t.Optional(
					t.Array(
						t.Union([
							t.Null(),
							t.Object({
								dueDate: t.String(),
								statementDate: t.String(),
							}),
						]),
					),
				),
				originalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
				purchaseDate: t.String(),
				recurrenceId: t.Union([t.Null(), t.String()]),
				recurrenceOccurrenceDate: t.Union([t.Null(), t.String()]),
				refinancingFeeAmount: t.Union([t.Null(), t.Number()]),
				storeName: t.Union([t.Null(), t.String()]),
				tagIds: t.Array(t.String()),
				time: t.Union([t.Null(), t.String()]),
				totalAmountCents: t.Number(),
				updatedAt: t.String(),
				userId: t.String(),
			}),
		),
		refunds: t.Array(
			t.Object({
				amountCents: t.Number(),
				canceledInstallmentNumbers: t.Optional(t.Array(t.Number())),
				cancellationEligible: t.Boolean(),
				createdAt: t.String(),
				creditDate: t.String(),
				creditStatementId: t.String(),
				deletedAt: t.Union([t.Null(), t.String()]),
				externalId: t.Optional(t.Union([t.Null(), t.String()])),
				id: t.String(),
				policy: t.Union([t.Literal("KEEP_INSTALLMENTS"), t.Literal("CANCEL_FUTURE_INSTALLMENTS")]),
				purchaseId: t.String(),
				time: t.Optional(t.Union([t.Null(), t.String()])),
				updatedAt: t.String(),
			}),
		),
		statements: t.Array(
			t.Object({
				creditCardId: t.String(),
				dueDate: t.String(),
				id: t.String(),
				isForecast: t.Optional(t.Boolean()),
				isFullySynced: t.Boolean(),
				isPaid: t.Boolean(),
				manualTotalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
				paidAmount: t.Number(),
				statementDate: t.String(),
				totalAmount: t.Number(),
			}),
		),
	}),
	"get /credit-cards/{}/history": t.Array(
		t.Object({
			changedAt: t.String(),
			creditCardId: t.String(),
			field: t.String(),
			id: t.String(),
			newValue: t.Union([t.Null(), t.String()]),
			oldValue: t.Union([t.Null(), t.String()]),
		}),
	),
	"get /credit-cards/{}/refund-reviews": t.Array(
		t.Object({
			id: t.String(),
			original: contracts.CreditPurchaseReturn,
		}),
	),
	"get /credit-cards/{}/statements{}": contracts.CreditCardStatementPageReturn,
	"get /credit-cards/{}/statements/{}": contracts.CreditCardStatementDetailReturn,
	"get /dashboard{}": contracts.DashboardReturn,
	"get /dashboard/comparison": t.Array(contracts.DashboardPeriodReturn),
	"get /debts": t.Object({
		people: t.Array(
			t.Object({
				accountEmail: t.Union([t.Null(), t.String()]),
				balance: t.Number(),
				balances: t.Optional(
					t.Array(
						t.Object({
							amount: t.Number(),
							currency: t.String(),
						}),
					),
				),
				connectionStatus: t.Union([
					t.Null(),
					t.Literal("PENDING"),
					t.Literal("ACCEPTED"),
					t.Literal("DECLINED"),
				]),
				id: t.String(),
				isZaimuUser: t.Boolean(),
				name: t.String(),
			}),
		),
		totals: t.Object({
			iOwe: t.Number(),
			net: t.Number(),
			owedToMe: t.Number(),
		}),
		totalsByCurrency: t.Optional(
			t.Array(
				t.Object({
					currency: t.String(),
					iOwe: t.Number(),
					net: t.Number(),
					owedToMe: t.Number(),
				}),
			),
		),
	}),
	"get /debts/invitations": t.Array(contracts.DebtInvitationReturn),
	"get /debts/invitations/{}/preview": contracts.DebtInvitationPreviewReturn,
	"get /debts/people/{}/events": t.Object({
		hasMore: t.Boolean(),
		items: t.Array(contracts.DebtEventReturn),
		nextCursor: t.Union([t.Null(), t.String()]),
	}),
	"get /financial-account-yield-holidays": t.Array(
		t.Object({
			countryCode: t.String(),
			currency: t.String(),
			date: t.String(),
			id: t.String(),
			name: t.String(),
		}),
	),
	"get /financial-account-yields": t.Object({
		hasMore: t.Boolean(),
		items: t.Array(contracts.FinancialAccountYieldReturn),
		nextCursor: t.Union([t.Null(), t.String()]),
	}),
	"get /financial-accounts": t.Array(contracts.FinancialAccountReturn),
	"get /financial-accounts/{}": contracts.FinancialAccountReturn,
	"get /financial-institutions": t.Array(contracts.FinancialInstitutionReturn),
	"get /financial-institutions/{}/profiles": t.Array(
		t.Object({
			id: t.String(),
			isDefault: t.Boolean(),
		}),
	),
	"get /health": t.Object({ status: t.Literal("ok") }),
	"get /loans": t.Array(contracts.LoanReturn),
	"get /loans/{}": t.Object({
		amortization: t.String(),
		createdAt: t.String(),
		currency: t.String(),
		description: t.Union([t.Null(), t.String()]),
		dueDay: t.Number(),
		firstDueDate: t.String(),
		id: t.String(),
		installmentAmount: t.Number(),
		interestRate: t.Number(),
		lender: t.String(),
		principalAmount: t.Number(),
		startDate: t.String(),
		totalInstallments: t.Number(),
		updatedAt: t.String(),
		userId: t.String(),
	}),
	"get /loans/{}/early-payoff": contracts.EarlyPayoffReturn,
	"get /loans/{}/history": t.Object({
		hasMore: t.Boolean(),
		items: t.Array(
			t.Object({
				changedAt: t.String(),
				field: t.String(),
				id: t.String(),
				loanId: t.String(),
				newValue: t.Union([t.Null(), t.String()]),
				oldValue: t.Union([t.Null(), t.String()]),
			}),
		),
		nextCursor: t.Union([t.Null(), t.String()]),
	}),
	"get /loans/{}/payments": contracts.LoanPaymentPageReturn,
	"get /open-finance": contracts.OpenFinanceConfigurationReturn,
	"get /open-finance/sync": contracts.OpenFinanceSyncStatusReturn,
	"get /stores": contracts.StorePageReturn,
	"get /transaction-imports": t.Array(contracts.TransactionImportSummaryReturn),
	"get /transaction-imports/{}": contracts.TransactionImportReturn,
	"get /transactions": t.Object({
		days: t.Array(
			t.Object({
				accountEndingBalances: t.Array(
					t.Object({
						amount: t.Number(),
						currency: t.String(),
						financialAccountId: t.String(),
					}),
				),
				date: t.String(),
				endingBalance: t.Number(),
				endingBalances: t.Array(
					t.Object({
						amount: t.Number(),
						currency: t.String(),
					}),
				),
				transactions: t.Array(contracts.TransactionReturn),
			}),
		),
		hasMore: t.Boolean(),
		nextCursor: t.Union([t.Null(), t.String()]),
	}),
	"get /transactions/{}": contracts.TransactionReturn,
	"get /transactions/{}/history": t.Array(
		t.Object({
			changedAt: t.String(),
			field: t.String(),
			id: t.String(),
			newValue: t.Union([t.Null(), t.String()]),
			oldValue: t.Union([t.Null(), t.String()]),
			transactionId: t.String(),
		}),
	),
	"get /transactions/transfer-suggestions": t.Array(
		t.Object({
			counterpart: contracts.TransactionReturn,
			transaction: contracts.TransactionReturn,
		}),
	),
	"patch /balance-adjustments/{}": t.Object({ id: t.String() }),
	"patch /categories/{}": contracts.CategoryReturn,
	"patch /credit-card-imports/{}/items/{}": contracts.CreditCardImportReturn,
	"patch /credit-cards/{}/purchases/{}": contracts.CreditPurchaseReturn,
	"patch /credit-cards/{}/purchases/{}/refunds/{}": contracts.CreditPurchaseReturn,
	"patch /credit-cards/{}/statement-cutoff": t.Object({
		ignoreStatementsBefore: t.Union([t.Null(), t.String()]),
	}),
	"patch /financial-account-yields/{}": t.Object({
		success: t.Boolean(),
	}),
	"patch /financial-accounts/{}": contracts.FinancialAccountReturn,
	"patch /loans/{}": contracts.LoanReturn,
	"patch /transaction-imports/{}/items/{}": contracts.TransactionImportReturn,
	"patch /transactions/{}": contracts.TransactionReturn,
	"post /balance-adjustments": t.Object({
		balance: t.Number(),
		calculatedBalance: t.Number(),
		createdAt: t.String(),
		currency: t.Optional(t.String()),
		date: t.String(),
		financialAccountId: t.String(),
		id: t.String(),
		name: t.Union([t.Null(), t.String()]),
	}),
	"post /categories": contracts.CategoryReturn,
	"post /credit-card-imports": contracts.CreditCardImportCreateResultReturn,
	"post /credit-card-imports/{}/approve": t.Object({
		created: t.Number(),
	}),
	"post /credit-card-imports/{}/items/{}/approve": t.Object({
		created: t.Number(),
	}),
	"post /credit-card-imports/{}/items/{}/approve-refund": t.Object({
		created: t.Number(),
		finished: t.Boolean(),
	}),
	"post /credit-card-imports/{}/items/{}/reconcile": contracts.CreditCardImportReturn,
	"post /credit-cards/{}/payments": t.Object({
		transaction: contracts.TransactionReturn,
	}),
	"post /credit-cards/{}/purchases": t.Array(contracts.CreditPurchaseReturn),
	"post /credit-cards/{}/purchases/{}/refinance": t.Object({
		purchases: t.Array(contracts.CreditPurchaseReturn),
		settledAmount: t.Number(),
		totalAmount: t.Number(),
	}),
	"post /credit-cards/{}/purchases/{}/refunds": contracts.CreditPurchaseReturn,
	"post /credit-cards/{}/refund-reviews/{}/approve": t.Object({
		id: t.String(),
		purchaseId: t.String(),
	}),
	"post /debts/people": contracts.DebtPersonReturn,
	"post /financial-account-yield-holidays": { 403: HttpErrorReturn },
	"post /financial-account-yields": contracts.FinancialAccountYieldReturn,
	"post /financial-accounts": contracts.FinancialAccountReturn,
	"post /loans": contracts.LoanReturn,
	"post /loans/{}/advance": t.Object({
		accountAmount: t.Union([t.Null(), t.Number()]),
		accountCurrency: t.Union([t.Null(), t.String()]),
		advancedInstallments: t.Number(),
		advanceType: t.Union([t.Literal("FRONT"), t.Literal("BACK")]),
		currency: t.String(),
		totalPaid: t.Number(),
	}),
	"post /loans/{}/payments/{}/pay": t.Object({
		accountAmount: t.Union([t.Null(), t.Number()]),
		accountCurrency: t.Union([t.Null(), t.String()]),
		advanceType: t.Union([t.Null(), t.Literal("FRONT"), t.Literal("BACK")]),
		createdAt: t.String(),
		currency: t.String(),
		dueDate: t.String(),
		financialAccountId: t.Union([t.Null(), t.String()]),
		id: t.String(),
		installmentNumber: t.Number(),
		interestPaid: t.Number(),
		isAdvanced: t.Boolean(),
		loanId: t.String(),
		paidDate: t.Union([t.Null(), t.String()]),
		principalPaid: t.Number(),
		totalPaid: t.Number(),
		updatedAt: t.String(),
	}),
	"post /open-finance/connections": contracts.OpenFinanceConfigurationReturn,
	"post /open-finance/connections/discover": t.Object({
		available: t.Boolean(),
		configured: t.Boolean(),
		connections: t.Array(contracts.OpenFinanceConnectionReturn),
		discoveryAvailable: t.Boolean(),
		errors: t.Array(
			t.Object({
				itemId: t.String(),
				message: t.String(),
			}),
		),
		lastQueriedAt: t.Union([t.Null(), t.String()]),
	}),
	"post /open-finance/sync": t.Object({
		runId: t.Union([t.Null(), t.String()]),
	}),
	"post /stores": contracts.StoreReturn,
	"post /sync": SyncReturn,
	"post /transaction-imports": contracts.TransactionImportCreateResultReturn,
	"post /transaction-imports/{}/approve": t.Object({
		created: t.Number(),
		finished: t.Boolean(),
	}),
	"post /transaction-imports/{}/days/{}/approve": t.Object({
		created: t.Number(),
		finished: t.Boolean(),
	}),
	"post /transaction-imports/{}/items/{}/approve": t.Object({
		created: t.Number(),
		finished: t.Boolean(),
	}),
	"post /transaction-imports/{}/items/{}/reconcile": contracts.TransactionImportReturn,
	"post /transaction-imports/{}/items/{}/transfer-suggestions/{}/accept": t.Object({
		removedImportId: t.String(),
		success: t.Literal(true),
	}),
	"post /transaction-imports/{}/items/{}/transfer-suggestions/{}/reject": t.Object({
		success: t.Literal(true),
	}),
	"post /transactions": contracts.TransactionReturn,
	"post /transactions/{}/transfer-suggestions/{}/accept": t.Object({
		success: t.Literal(true),
	}),
	"post /transactions/{}/transfer-suggestions/{}/reject": t.Object({
		success: t.Literal(true),
	}),
	"put /financial-accounts/primary": t.Object({
		financialAccountId: t.Union([t.Null(), t.String()]),
	}),
};
