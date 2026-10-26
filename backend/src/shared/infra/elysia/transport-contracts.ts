import { t } from "elysia";
import { RefundImportReviewDTO } from "~/modules/credit-card-imports/infra/elysia/CreditCardImportsDTO";
import { CardCalendarPeriodDTO } from "~/modules/creditCards/infra/elysia/CardCalendarPeriodDTO";

export const OpenFinanceBindingReturn = t.Object({
	connectionId: t.String(),
	creditCardId: t.Union([t.Null(), t.String()]),
	financialAccountId: t.Union([t.Null(), t.String()]),
	id: t.String(),
	paused: t.Boolean(),
	remoteAccountId: t.String(),
});
export type OpenFinanceBindingReturn = typeof OpenFinanceBindingReturn.static;

export const OpenFinanceConnectionReturn = t.Object({
	bankName: t.String(),
	bankUpdatedAt: t.Union([t.Null(), t.String()]),
	bindings: t.Array(OpenFinanceBindingReturn),
	id: t.String(),
	itemId: t.String(),
	remoteAccounts: t.Array(
		t.Object({
			currencyCode: t.String(),
			id: t.String(),
			name: t.String(),
			type: t.String(),
		}),
	),
	status: t.String(),
});
export type OpenFinanceConnectionReturn = typeof OpenFinanceConnectionReturn.static;

export const OpenFinanceConfigurationReturn = t.Object({
	available: t.Boolean(),
	configured: t.Boolean(),
	connections: t.Array(OpenFinanceConnectionReturn),
	lastQueriedAt: t.Union([t.Null(), t.String()]),
});
export type OpenFinanceConfigurationReturn = typeof OpenFinanceConfigurationReturn.static;

export const OpenFinanceSyncStatusReturn = t.Object({
	reviews: t.Array(
		t.Object({
			count: t.Number(),
			importId: t.String(),
			kind: t.String(),
		}),
	),
	run: t.Union([
		t.Null(),
		t.Object({
			errors: t.Array(
				t.Object({
					connectionId: t.String(),
					message: t.String(),
				}),
			),
			finishedAt: t.Union([t.Null(), t.String()]),
			id: t.String(),
			imported: t.Number(),
			linked: t.Number(),
			pending: t.Number(),
			processed: t.Number(),
			startedAt: t.String(),
			status: t.String(),
		}),
	]),
});
export type OpenFinanceSyncStatusReturn = typeof OpenFinanceSyncStatusReturn.static;

export const FinancialInstitutionYieldRuleReturn = t.Object({
	upToBalance: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldFixedRate: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldReferencePercentage: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldReferenceType: t.Optional(t.Union([t.Null(), t.Literal("CDI"), t.Literal("SELIC")])),
});
export type FinancialInstitutionYieldRuleReturn = typeof FinancialInstitutionYieldRuleReturn.static;

export const FinancialInstitutionYieldPolicyReturn = t.Object({
	countryCode: t.Optional(t.Union([t.Null(), t.String()])),
	currency: t.Optional(t.String()),
	effectiveDate: t.String(),
	effectiveUntil: t.Optional(t.Union([t.Null(), t.String()])),
	profileId: t.Optional(t.Union([t.Null(), t.String()])),
	requestedEffectiveDate: t.Optional(t.String()),
	rules: t.Array(FinancialInstitutionYieldRuleReturn),
	status: t.Optional(t.Union([t.Literal("PENDING"), t.Literal("APPROVED"), t.Literal("REJECTED")])),
	yieldPeriod: t.Optional(t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	yieldTaxIds: t.Optional(t.Union([t.Null(), t.Array(t.String())])),
	yieldTaxRate: t.Optional(t.Union([t.Null(), t.Number()])),
});
export type FinancialInstitutionYieldPolicyReturn = typeof FinancialInstitutionYieldPolicyReturn.static;

export const FinancialInstitutionReturn = t.Object({
	accountCurrenciesByCountry: t.Optional(t.Record(t.String(), t.Array(t.String()))),
	cardRulesProfiles: t.Optional(
		t.Array(
			t.Object({
				creditCardRules: t.Optional(
					t.Union([
						t.Null(),
						t.Object({
							cashback: t.Union([
								t.Null(),
								t.Object({
									conversionAmount: t.Union([t.Null(), t.Number()]),
									conversionPoints: t.Union([t.Null(), t.Number()]),
									kind: t.Union([t.Literal("CASHBACK"), t.Literal("POINTS")]),
									rate: t.Number(),
									yieldPeriod: t.Union([
										t.Null(),
										t.Literal("MONTHLY"),
										t.Literal("YEARLY"),
									]),
									yieldReferencePercentage: t.Union([t.Null(), t.Number()]),
									yieldReferenceRate: t.Union([t.Null(), t.Number()]),
								}),
							]),
							workingDueDate: t.Boolean(),
						}),
					]),
				),
				id: t.String(),
				isDefault: t.Boolean(),
			}),
		),
	),
	creditCardRules: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				cashback: t.Union([
					t.Null(),
					t.Object({
						conversionAmount: t.Union([t.Null(), t.Number()]),
						conversionPoints: t.Union([t.Null(), t.Number()]),
						kind: t.Union([t.Literal("CASHBACK"), t.Literal("POINTS")]),
						rate: t.Number(),
						yieldPeriod: t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")]),
						yieldReferencePercentage: t.Union([t.Null(), t.Number()]),
						yieldReferenceRate: t.Union([t.Null(), t.Number()]),
					}),
				]),
				workingDueDate: t.Boolean(),
			}),
		]),
	),
	creditInstallmentRemainderOnFirst: t.Optional(t.Boolean()),
	creditStatementClosingInclusive: t.Optional(t.Boolean()),
	currency: t.Optional(t.String()),
	id: t.String(),
	name: t.String(),
	operatingCountryCodes: t.Optional(t.Array(t.String())),
	status: t.Optional(
		t.Union([
			t.Literal("LEGACY_PRIVATE"),
			t.Literal("PENDING"),
			t.Literal("APPROVED"),
			t.Literal("REJECTED"),
			t.Literal("REJECTED_PRIVATE"),
		]),
	),
	version: t.Optional(t.Number()),
	yieldPolicies: t.Optional(t.Array(FinancialInstitutionYieldPolicyReturn)),
});
export type FinancialInstitutionReturn = typeof FinancialInstitutionReturn.static;

export const FinancialAccountYieldRateHistoryReturn = t.Object({
	effectiveDate: t.String(),
	yieldFixedRate: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldPeriod: t.Optional(t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	yieldReferencePercentage: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldReferenceType: t.Optional(t.Union([t.Null(), t.Literal("CDI"), t.Literal("SELIC")])),
	yieldTaxIds: t.Optional(t.Union([t.Null(), t.Array(t.String())])),
	yieldTaxRate: t.Optional(t.Union([t.Null(), t.Number()])),
});
export type FinancialAccountYieldRateHistoryReturn = typeof FinancialAccountYieldRateHistoryReturn.static;

export const CreditCardStatementReturn = t.Object({
	actualInvoiceAmount: t.Optional(t.Number()),
	amountDue: t.Optional(t.Number()),
	balanceAmount: t.Number(),
	calculatedTotalAmount: t.Optional(t.Number()),
	carriedInAmount: t.Optional(t.Number()),
	carriedOutAmount: t.Optional(t.Number()),
	chargesAmount: t.Optional(t.Number()),
	creditCardId: t.String(),
	creditInAmount: t.Optional(t.Number()),
	dueDate: t.String(),
	id: t.String(),
	invoiceAmount: t.Optional(t.Number()),
	isForecast: t.Optional(t.Boolean()),
	isFullySynced: t.Optional(t.Boolean()),
	isPaid: t.Boolean(),
	manualTotalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	paidAmount: t.Number(),
	periodPaymentAmount: t.Optional(t.Number()),
	preClosingPaymentAmount: t.Optional(t.Number()),
	scheduledPaymentAmount: t.Optional(t.Number()),
	statementDate: t.String(),
	status: t.Optional(t.Union([t.Literal("OPEN"), t.Literal("PAID"), t.Literal("CARRIED")])),
	totalAmount: t.Number(),
});
export type CreditCardStatementReturn = typeof CreditCardStatementReturn.static;

export const CreditCardReturn = t.Object({
	accountName: t.Optional(t.Union([t.Null(), t.String()])),
	calendarHistory: t.Optional(t.Nullable(t.Array(CardCalendarPeriodDTO))),
	cashbackAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	cashbackRate: t.Optional(t.Union([t.Null(), t.Number()])),
	cashbackYieldPeriod: t.Optional(t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	cashbackYieldReferencePercentage: t.Optional(t.Union([t.Null(), t.Number()])),
	cashbackYieldReferenceRate: t.Optional(t.Union([t.Null(), t.Number()])),
	creditLimit: t.Number(),
	currency: t.Optional(t.String()),
	currentStatement: t.Union([
		t.Null(),
		t.Pick(CreditCardStatementReturn, [
			"balanceAmount",
			"calculatedTotalAmount",
			"chargesAmount",
			"creditCardId",
			"dueDate",
			"id",
			"paidAmount",
			"statementDate",
			"totalAmount",
		]),
	]),
	dueDay: t.Number(),
	excludeFromTotals: t.Boolean(),
	financialAccountId: t.String(),
	id: t.String(),
	ignoreStatementsBefore: t.Optional(t.Union([t.Null(), t.String()])),
	limit: t.Object({
		availableLimit: t.Number(),
		effectiveLimit: t.Number(),
		temporaryCredit: t.Number(),
		usedLimit: t.Number(),
	}),
	paymentAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	paymentSuggestionsEnabled: t.Optional(t.Boolean()),
	pendingRefundReviewCount: t.Optional(t.Number()),
	securityDeposit: t.Optional(t.Union([t.Null(), t.Number()])),
	statementDay: t.Number(),
	workingDueDate: t.Boolean(),
});
export type CreditCardReturn = typeof CreditCardReturn.static;

export const RewardsAccountReturn = t.Object({
	conversionAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	conversionCurrency: t.Optional(t.String()),
	conversionPoints: t.Optional(t.Union([t.Null(), t.Number()])),
	financialAccountId: t.String(),
	id: t.String(),
	initialBalance: t.Number(),
	kind: t.Union([t.Literal("CASHBACK"), t.Literal("POINTS")]),
});
export type RewardsAccountReturn = typeof RewardsAccountReturn.static;

export const FinancialAccountReturn = t.Object({
	balance: t.Union([t.Null(), t.Number()]),
	cardRulesProfiles: t.Optional(
		t.Array(
			t.Object({
				creditCardRules: t.Optional(
					t.Union([
						t.Null(),
						t.Object({
							cashback: t.Union([
								t.Null(),
								t.Object({
									conversionAmount: t.Union([t.Null(), t.Number()]),
									conversionPoints: t.Union([t.Null(), t.Number()]),
									kind: t.Union([t.Literal("CASHBACK"), t.Literal("POINTS")]),
									rate: t.Number(),
									yieldPeriod: t.Union([
										t.Null(),
										t.Literal("MONTHLY"),
										t.Literal("YEARLY"),
									]),
									yieldReferencePercentage: t.Union([t.Null(), t.Number()]),
									yieldReferenceRate: t.Union([t.Null(), t.Number()]),
								}),
							]),
							workingDueDate: t.Boolean(),
						}),
					]),
				),
				id: t.String(),
				isDefault: t.Boolean(),
			}),
		),
	),
	countryCode: t.Optional(t.Union([t.Null(), t.String()])),
	createdAt: t.String(),
	creditCard: t.Optional(CreditCardReturn),
	currency: t.Optional(t.String()),
	defaultInstitutionProfileId: t.Optional(t.Union([t.Null(), t.String()])),
	globalRulesFrom: t.Optional(t.Union([t.Null(), t.String()])),
	id: t.String(),
	institution: t.Optional(t.Union([t.Null(), FinancialInstitutionReturn])),
	institutionId: t.Optional(t.Union([t.Null(), t.String()])),
	institutionProfileChanges: t.Optional(
		t.Array(
			t.Object({
				effectiveDate: t.String(),
				profileId: t.String(),
			}),
		),
	),
	isDefaultForStatements: t.Optional(t.Boolean()),
	isHidden: t.Optional(t.Boolean()),
	isPrimary: t.Optional(t.Boolean()),
	name: t.Union([t.Null(), t.String()]),
	rewardsAccount: t.Optional(t.Nullable(RewardsAccountReturn)),
	type: t.Union([
		t.Literal("CHECKING"),
		t.Literal("SAVINGS"),
		t.Literal("INVESTMENT"),
		t.Literal("CASH"),
		t.Literal("CREDIT_CARD"),
		t.Literal("REWARDS"),
	]),
	updatedAt: t.String(),
	userId: t.String(),
	yieldFixedRate: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldPeriod: t.Optional(t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	yieldRateHistories: t.Optional(t.Array(FinancialAccountYieldRateHistoryReturn)),
	yieldReferencePercentage: t.Optional(t.Union([t.Null(), t.Number()])),
	yieldReferenceType: t.Optional(t.Union([t.Null(), t.Literal("CDI"), t.Literal("SELIC")])),
	yieldTaxIds: t.Optional(t.Union([t.Null(), t.Array(t.String())])),
	yieldTaxRate: t.Optional(t.Union([t.Null(), t.Number()])),
});
export type FinancialAccountReturn = typeof FinancialAccountReturn.static;

export const FinancialAccountYieldReturn = t.Object({
	accountName: t.Optional(t.String()),
	amount: t.Union([t.Null(), t.Number()]),
	currency: t.Optional(t.String()),
	date: t.String(),
	endingBalance: t.Optional(t.Number()),
	financialAccountId: t.String(),
	id: t.String(),
	isExcluded: t.Boolean(),
	isHidden: t.Optional(t.Boolean()),
	isSynced: t.Optional(t.Boolean()),
	kind: t.Union([t.Literal("AUTOMATIC"), t.Literal("MANUAL")]),
	origin: t.Optional(t.Union([t.Literal("SYSTEM"), t.Literal("USER")])),
	time: t.Optional(t.Union([t.Null(), t.String()])),
});
export type FinancialAccountYieldReturn = typeof FinancialAccountYieldReturn.static;

export const CategoryReturn = t.Object({
	color: t.Optional(t.Union([t.Null(), t.String()])),
	icon: t.Optional(t.Union([t.Null(), t.String()])),
	id: t.String(),
	name: t.String(),
	parentId: t.Optional(t.Union([t.Null(), t.String()])),
	userId: t.String(),
});
export type CategoryReturn = typeof CategoryReturn.static;

export const CategoryPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(CategoryReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
});
export type CategoryPageReturn = typeof CategoryPageReturn.static;

export const TagReturn = t.Object({
	color: t.Optional(t.Union([t.Null(), t.String()])),
	icon: t.Optional(t.Union([t.Null(), t.String()])),
	id: t.String(),
	name: t.String(),
});
export type TagReturn = typeof TagReturn.static;

export const CreditCardImportPurchaseDuplicateReturn = t.Object({
	currentInstallment: t.Number(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.String(),
	existingInstallments: t.Number(),
	id: t.String(),
	installmentAmount: t.Number(),
	installments: t.Number(),
	purchaseDate: t.String(),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Array(t.String()),
	tags: t.Array(TagReturn),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	totalAmount: t.Number(),
});
export type CreditCardImportPurchaseDuplicateReturn = typeof CreditCardImportPurchaseDuplicateReturn.static;

export const CreditCardImportItemReturn = t.Object({
	createdAt: t.String(),
	currentInstallment: t.Number(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.String(),
	duplicates: t.Array(CreditCardImportPurchaseDuplicateReturn),
	id: t.String(),
	installmentAmount: t.Number(),
	installments: t.Number(),
	isSelected: t.Boolean(),
	isStatementCharge: t.Optional(t.Boolean()),
	metadataMissing: t.Optional(t.Array(t.String())),
	purchaseDate: t.String(),
	reconciledCreditPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	refundReview: t.Optional(t.Nullable(RefundImportReviewDTO)),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Array(t.String()),
	tags: t.Array(TagReturn),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	totalAmount: t.Number(),
	updatedAt: t.String(),
});
export type CreditCardImportItemReturn = typeof CreditCardImportItemReturn.static;

export const CreditCardImportReturn = t.Object({
	createdAt: t.String(),
	creditCardId: t.String(),
	dueDate: t.String(),
	fileName: t.String(),
	hasMore: t.Boolean(),
	id: t.String(),
	items: t.Array(CreditCardImportItemReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
	pendingItemCount: t.Number(),
	previousBalanceCheck: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				calculated: t.Number(),
				matches: t.Boolean(),
				reported: t.Number(),
			}),
		]),
	),
	provider: t.Union([
		t.Literal("MEUPLUGGY"),
		t.Literal("MERCADO_PAGO"),
		t.Literal("BRADESCO"),
		t.Literal("INTER"),
		t.Literal("NUBANK"),
		t.Literal("PICPAY"),
		t.Literal("WILL_BANK"),
	]),
	statementDate: t.String(),
	status: t.Union([t.Literal("PENDING"), t.Literal("APPROVED")]),
	updatedAt: t.String(),
});
export type CreditCardImportReturn = typeof CreditCardImportReturn.static;

export const CreditCardImportCreateResultReturn = t.Object({
	creditCardImport: t.Union([t.Null(), CreditCardImportReturn]),
	ignoredCount: t.Number(),
});
export type CreditCardImportCreateResultReturn = typeof CreditCardImportCreateResultReturn.static;

export const CreditCardImportSummaryReturn = t.Object({
	fileName: t.String(),
	id: t.String(),
	pendingItemCount: t.Number(),
});
export type CreditCardImportSummaryReturn = typeof CreditCardImportSummaryReturn.static;

export const FinancialFeeReturn = t.Object({
	amount: t.Number(),
	name: t.String(),
	type: t.Union([t.Literal("PERCENTAGE"), t.Literal("FIXED")]),
});
export type FinancialFeeReturn = typeof FinancialFeeReturn.static;

export const CreditPurchaseReturn = t.Object({
	bookingCurrency: t.Optional(t.String()),
	cashbackAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	cashbackAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	cashbackYieldPeriod: t.Optional(t.Union([t.Null(), t.Literal("MONTHLY"), t.Literal("YEARLY")])),
	cashbackYieldReferencePercentage: t.Optional(t.Union([t.Null(), t.Number()])),
	cashbackYieldReferenceRate: t.Optional(t.Union([t.Null(), t.Number()])),
	creditCardId: t.Optional(t.String()),
	currency: t.Optional(t.String()),
	currentInstallment: t.Number(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.String(),
	entryKind: t.Optional(t.Union([t.Literal("INSTALLMENT"), t.Literal("REFUND"), t.Literal("CHARGE")])),
	exchangeRate: t.Optional(t.Union([t.Null(), t.Number()])),
	feeAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	feeDescription: t.Optional(t.Union([t.Null(), t.String()])),
	fees: t.Optional(t.Array(FinancialFeeReturn)),
	hasRefund: t.Optional(t.Boolean()),
	id: t.String(),
	installmentAmount: t.Number(),
	installments: t.Number(),
	isForecast: t.Optional(t.Boolean()),
	isFullySynced: t.Optional(t.Boolean()),
	isRefund: t.Optional(t.Boolean()),
	isReimbursed: t.Optional(t.Boolean()),
	isSettled: t.Optional(t.Boolean()),
	isStatementCharge: t.Optional(t.Boolean()),
	isSynced: t.Optional(t.Boolean()),
	originalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	originalPurchaseDate: t.Optional(t.String()),
	parentId: t.Optional(t.String()),
	purchaseDate: t.String(),
	purchaseId: t.Optional(t.String()),
	recurrenceId: t.Optional(t.String()),
	recurrenceOccurrenceDate: t.Optional(t.String()),
	refinancedFromPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	refinancingFeeAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	refinancingOriginalPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	refinancingPurchaseIds: t.Optional(t.Array(t.String())),
	refund: t.Optional(
		t.Object({
			amount: t.Number(),
			date: t.String(),
			id: t.String(),
		}),
	),
	refundableAmount: t.Optional(t.Number()),
	refundedAmount: t.Optional(t.Number()),
	refundOfPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	refunds: t.Optional(
		t.Array(
			t.Object({
				amount: t.Number(),
				canceledAmount: t.Number(),
				canceledInstallmentNumbers: t.Optional(t.Array(t.Number())),
				creditAmount: t.Number(),
				date: t.String(),
				id: t.String(),
				policy: t.Union([t.Literal("KEEP_INSTALLMENTS"), t.Literal("CANCEL_FUTURE_INSTALLMENTS")]),
			}),
		),
	),
	settledByPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	statementId: t.String(),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Optional(t.Array(t.String())),
	tags: t.Optional(t.Array(TagReturn)),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	totalAmount: t.Number(),
});
export type CreditPurchaseReturn = typeof CreditPurchaseReturn.static;

export const DebtSplitSummaryReturn = t.Object({
	ownerAmount: t.Number(),
	participants: t.Array(
		t.Object({
			amount: t.Number(),
			debtPersonName: t.String(),
		}),
	),
});
export type DebtSplitSummaryReturn = typeof DebtSplitSummaryReturn.static;

export const TransactionReturn = t.Object({
	amount: t.Number(),
	bookingCurrency: t.Optional(t.String()),
	conversionSource: t.Optional(t.Union([t.Null(), t.Literal("MANUAL"), t.Literal("DAILY")])),
	createdAt: t.String(),
	creditCardId: t.Optional(t.Nullable(t.String())),
	creditCardName: t.Optional(t.Union([t.Null(), t.String()])),
	creditCardStatementDate: t.Optional(t.Union([t.Null(), t.String()])),
	currency: t.Optional(t.String()),
	currentInstallment: t.Optional(t.Nullable(t.Number())),
	date: t.String(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	debtSplitSummary: t.Optional(t.Union([t.Null(), DebtSplitSummaryReturn])),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	destinationAccountRewardsKind: t.Optional(
		t.Union([t.Null(), t.Literal("CASHBACK"), t.Literal("POINTS")]),
	),
	destinationAccountType: t.Optional(
		t.Union([
			t.Null(),
			t.Literal("CHECKING"),
			t.Literal("SAVINGS"),
			t.Literal("INVESTMENT"),
			t.Literal("CASH"),
			t.Literal("CREDIT_CARD"),
			t.Literal("REWARDS"),
		]),
	),
	destinationAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	destinationCurrency: t.Optional(t.Union([t.Null(), t.String()])),
	destinationFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	destinationName: t.Optional(t.Union([t.Null(), t.String()])),
	entryKind: t.Optional(t.Union([t.Literal("INSTALLMENT"), t.Literal("REFUND"), t.Literal("CHARGE")])),
	exchangeRate: t.Optional(t.Union([t.Null(), t.Number()])),
	externalIds: t.Optional(t.Array(t.String())),
	feeAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	feeDescription: t.Optional(t.Union([t.Null(), t.String()])),
	fees: t.Optional(t.Array(FinancialFeeReturn)),
	hasRefund: t.Optional(t.Boolean()),
	id: t.String(),
	installmentAmount: t.Optional(t.Nullable(t.Number())),
	installments: t.Optional(t.Nullable(t.Number())),
	isFullySynced: t.Optional(t.Boolean()),
	isHidden: t.Optional(t.Boolean()),
	isRefund: t.Optional(t.Boolean()),
	isSynced: t.Optional(t.Boolean()),
	originAccountRewardsKind: t.Optional(t.Union([t.Null(), t.Literal("CASHBACK"), t.Literal("POINTS")])),
	originAccountType: t.Optional(
		t.Union([
			t.Null(),
			t.Literal("CHECKING"),
			t.Literal("SAVINGS"),
			t.Literal("INVESTMENT"),
			t.Literal("CASH"),
			t.Literal("CREDIT_CARD"),
			t.Literal("REWARDS"),
		]),
	),
	originalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	originFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	originName: t.Optional(t.Union([t.Null(), t.String()])),
	parentId: t.Optional(t.Nullable(t.String())),
	paymentAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	paymentCreditCardId: t.Optional(t.Nullable(t.String())),
	paymentCurrency: t.Optional(t.Union([t.Null(), t.String()])),
	recurrenceId: t.Optional(t.Nullable(t.String())),
	recurrenceOccurrenceDate: t.Optional(t.Nullable(t.String())),
	refund: t.Optional(
		t.Object({
			amount: t.Number(),
			date: t.String(),
			id: t.String(),
		}),
	),
	refundOfPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	source: t.Optional(t.Union([t.Literal("CREDIT_CARD"), t.Literal("FINANCIAL_ACCOUNT")])),
	sourceName: t.Optional(t.Nullable(t.String())),
	statementId: t.Optional(t.Union([t.Null(), t.String()])),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Optional(t.Array(t.String())),
	tags: t.Optional(t.Array(TagReturn)),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	type: t.Union([t.Literal("REFUND"), t.Literal("INCOME"), t.Literal("EXPENSE"), t.Literal("TRANSFER")]),
});
export type TransactionReturn = typeof TransactionReturn.static;

export const CreditCardStatementDetailReturn = t.Object({
	amountDue: t.Optional(t.Number()),
	balanceAmount: t.Number(),
	calculatedTotalAmount: t.Optional(t.Number()),
	carriedInAmount: t.Optional(t.Number()),
	carriedOutAmount: t.Optional(t.Number()),
	chargesAmount: t.Optional(t.Number()),
	creditCardId: t.String(),
	creditInAmount: t.Optional(t.Number()),
	dueDate: t.String(),
	id: t.String(),
	invoiceAmount: t.Optional(t.Number()),
	isForecast: t.Optional(t.Boolean()),
	isFullySynced: t.Optional(t.Boolean()),
	isPaid: t.Boolean(),
	manualTotalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	paidAmount: t.Number(),
	payments: t.Array(TransactionReturn),
	periodPaymentAmount: t.Optional(t.Number()),
	preClosingPaymentAmount: t.Optional(t.Number()),
	purchases: t.Array(CreditPurchaseReturn),
	scheduledPaymentAmount: t.Optional(t.Number()),
	statementDate: t.String(),
	status: t.Optional(t.Union([t.Literal("OPEN"), t.Literal("PAID"), t.Literal("CARRIED")])),
	totalAmount: t.Number(),
});
export type CreditCardStatementDetailReturn = typeof CreditCardStatementDetailReturn.static;

export const CreditCardStatementPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(CreditCardStatementReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
});
export type CreditCardStatementPageReturn = typeof CreditCardStatementPageReturn.static;

export const DashboardPeriodReturn = t.Object({
	accountBalance: t.Number(),
	cardExpenses: t.Optional(t.Number()),
	endDate: t.String(),
	endingBalance: t.Number(),
	expenses: t.Number(),
	fixedIncomeBalance: t.Number(),
	income: t.Number(),
	initialBalance: t.Number(),
	net: t.Number(),
	recurringCardExpenses: t.Optional(t.Number()),
	recurringExpenses: t.Number(),
	recurringIncome: t.Number(),
	savingsBalance: t.Number(),
	startDate: t.String(),
	variableIncomeBalance: t.Number(),
});
export type DashboardPeriodReturn = typeof DashboardPeriodReturn.static;

export const DashboardReturn = t.Object({
	accounts: t.Array(
		t.Object({
			balance: t.Number(),
			currency: t.Optional(t.String()),
			id: t.String(),
			institutionName: t.Union([t.Null(), t.String()]),
			name: t.Union([t.Null(), t.String()]),
			type: t.Union([FinancialAccountReturn.properties.type, t.Literal("CASHBACK")]),
		}),
	),
	balanceBreakdown: t.Union([
		t.Null(),
		t.Object({
			accountBalance: t.Number(),
			fixedIncomeBalance: t.Number(),
			savingsBalance: t.Number(),
			variableIncomeBalance: t.Number(),
		}),
	]),
	consolidation: t.Optional(
		t.Object({
			forecastAvailable: t.Boolean(),
			histories: t.Array(
				t.Object({
					collectionId: t.String(),
					coveredDays: t.Number(),
					endDate: t.String(),
					requestedDays: t.Number(),
					startDate: t.String(),
					state: t.String(),
				}),
			),
			method: t.Literal("EXPONENTIAL_90_DAY_HALF_LIFE"),
			publishedDates: t.Record(t.String(), t.String()),
			unavailable: t.Boolean(),
		}),
	),
	creditCards: t.Array(
		t.Object({
			availableLimit: t.Number(),
			creditLimit: t.Number(),
			currency: t.Optional(t.String()),
			excludeFromTotals: t.Boolean(),
			financialAccountId: t.String(),
			id: t.String(),
			institutionName: t.Union([t.Null(), t.String()]),
			name: t.Union([t.Null(), t.String()]),
			statement: t.Union([
				t.Null(),
				t.Object({
					balanceAmount: t.Number(),
					dueDate: t.String(),
					id: t.String(),
				}),
			]),
		}),
	),
	currency: t.Optional(t.String()),
	dailyBalances: t.Array(
		t.Object({
			balance: t.Number(),
			date: t.String(),
		}),
	),
	debts: t.Union([
		t.Null(),
		t.Object({
			iOwe: t.Number(),
			net: t.Number(),
			owedToMe: t.Number(),
			people: t.Array(
				t.Object({
					balance: t.Number(),
					direction: t.Union([t.Literal("OWED"), t.Literal("OWES")]),
					id: t.String(),
					name: t.String(),
				}),
			),
		}),
	]),
	forecasts: t.Array(
		t.Object({
			amount: t.Number(),
			date: t.String(),
			direction: t.Union([t.Literal("INCOME"), t.Literal("EXPENSE")]),
			id: t.String(),
			name: t.String(),
			sourceId: t.String(),
			type: t.Union([
				t.Literal("CARD"),
				t.Literal("LOAN"),
				t.Literal("RECURRING"),
				t.Literal("SALARY"),
				t.Literal("SUBSCRIPTION"),
				t.Literal("TRANSACTION"),
			]),
		}),
	),
	nativeAsOf: t.Optional(t.String()),
	period: t.Union([t.Null(), DashboardPeriodReturn]),
	projectedCashFlowUntilMonthEnd: t.Union([
		t.Null(),
		t.Object({
			expenses: t.Number(),
			income: t.Number(),
			net: t.Number(),
			recurringExpenses: t.Number(),
			recurringIncome: t.Number(),
		}),
	]),
	referenceRatesAvailable: t.Boolean(),
	totalAvailableCredit: t.Union([t.Null(), t.Number()]),
});
export type DashboardReturn = typeof DashboardReturn.static;

export const DebtEventReturn = t.Object({
	amount: t.Number(),
	createdByMe: t.Boolean(),
	createdByName: t.String(),
	createdByUserId: t.String(),
	currency: t.Optional(t.String()),
	date: t.Union([t.Null(), t.String()]),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	dueDate: t.Optional(t.Union([t.Null(), t.String()])),
	effect: t.Number(),
	id: t.String(),
	kind: t.Union([
		t.Literal("TRANSACTION"),
		t.Literal("ORIGIN"),
		t.Literal("PURCHASE"),
		t.Literal("MIGRATED_SETTLEMENT"),
	]),
	time: t.Union([t.Null(), t.String()]),
});
export type DebtEventReturn = typeof DebtEventReturn.static;

export const DebtPersonReturn = t.Object({
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
	connectionStatus: t.Union([t.Null(), t.Literal("PENDING"), t.Literal("ACCEPTED"), t.Literal("DECLINED")]),
	events: t.Array(DebtEventReturn),
	id: t.String(),
	isZaimuUser: t.Boolean(),
	name: t.String(),
});
export type DebtPersonReturn = typeof DebtPersonReturn.static;

export const DebtInvitationPreviewReturn = t.Object({
	balance: t.Number(),
	balances: t.Optional(
		t.Array(
			t.Object({
				amount: t.Number(),
				currency: t.String(),
			}),
		),
	),
	eventCount: t.Number(),
	hasMore: t.Boolean(),
	items: t.Array(DebtEventReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
});
export type DebtInvitationPreviewReturn = typeof DebtInvitationPreviewReturn.static;

export const DebtInvitationReturn = t.Object({
	counterpartyName: t.String(),
	createdAt: t.String(),
	direction: t.Union([t.Literal("RECEIVED"), t.Literal("SENT")]),
	id: t.String(),
	status: t.Union([t.Literal("PENDING"), t.Literal("ACCEPTED"), t.Literal("DECLINED")]),
});
export type DebtInvitationReturn = typeof DebtInvitationReturn.static;

export const LoanReturn = t.Object({
	amortization: t.Union([t.Literal("PRICE"), t.Literal("SAC")]),
	currency: t.Optional(t.String()),
	description: t.Optional(t.Nullable(t.String())),
	dueDay: t.Number(),
	firstDueDate: t.String(),
	id: t.String(),
	installmentAmount: t.Number(),
	interestRate: t.Number(),
	lender: t.String(),
	needsPaymentReview: t.Optional(t.Boolean()),
	paidInstallments: t.Optional(t.Number()),
	principalAmount: t.Number(),
	remainingInstallments: t.Optional(t.Number()),
	remainingPrincipal: t.Optional(t.Number()),
	startDate: t.String(),
	totalInstallments: t.Number(),
	totalPaid: t.Optional(t.Number()),
	userId: t.String(),
});
export type LoanReturn = typeof LoanReturn.static;

export const EarlyPayoffReturn = t.Object({
	advanceType: t.Union([t.Literal("FRONT"), t.Literal("BACK")]),
	currency: t.Optional(t.String()),
	loanId: t.String(),
	paidInstallments: t.Number(),
	remainingPrincipal: t.Number(),
	savedInterest: t.Number(),
	targetDate: t.String(),
	totalToPay: t.Number(),
});
export type EarlyPayoffReturn = typeof EarlyPayoffReturn.static;

export const LoanPaymentReturn = t.Object({
	accountAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	accountCurrency: t.Optional(t.Union([t.Null(), t.String()])),
	advanceType: t.Optional(t.Union([t.Null(), t.Literal("FRONT"), t.Literal("BACK")])),
	currency: t.Optional(t.String()),
	dueDate: t.String(),
	financialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	id: t.String(),
	installmentNumber: t.Number(),
	interestPaid: t.Number(),
	isAdvanced: t.Boolean(),
	loanId: t.String(),
	paidDate: t.Optional(t.Union([t.Null(), t.String()])),
	principalPaid: t.Number(),
	totalPaid: t.Number(),
});
export type LoanPaymentReturn = typeof LoanPaymentReturn.static;

export const LoanPaymentPageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(LoanPaymentReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
});
export type LoanPaymentPageReturn = typeof LoanPaymentPageReturn.static;

export const StoreReturn = t.Object({
	id: t.String(),
	name: t.String(),
	userId: t.String(),
});
export type StoreReturn = typeof StoreReturn.static;

export const StorePageReturn = t.Object({
	hasMore: t.Boolean(),
	items: t.Array(StoreReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
});
export type StorePageReturn = typeof StorePageReturn.static;

export const FinancialAccountYieldHolidayReturn = t.Object({
	date: t.String(),
	id: t.String(),
});
export type FinancialAccountYieldHolidayReturn = typeof FinancialAccountYieldHolidayReturn.static;

export const StoredDebtEventReturn = t.Object({
	amount: t.Number(),
	baseUpdatedAt: t.Optional(t.String()),
	createdAt: t.String(),
	currency: t.Optional(t.String()),
	date: t.Union([t.Null(), t.String()]),
	debtPersonId: t.String(),
	deletedAt: t.Optional(t.Union([t.Null(), t.String()])),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	dueDate: t.Optional(t.Union([t.Null(), t.String()])),
	effect: t.Number(),
	id: t.String(),
	kind: t.Union([t.Literal("ORIGIN"), t.Literal("MIGRATED_SETTLEMENT")]),
	updatedAt: t.String(),
	upgradeRecordId: t.Optional(t.String()),
});
export type StoredDebtEventReturn = typeof StoredDebtEventReturn.static;

export const TransactionImportDuplicateReturn = t.Object({
	amount: t.Number(),
	createdAt: t.String(),
	date: t.String(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	destinationFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	id: t.String(),
	isHidden: t.Boolean(),
	originFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	paymentCreditCardId: t.Optional(t.Union([t.Null(), t.String()])),
	source: t.Union([t.Literal("TRANSACTION"), t.Literal("IMPORT_ITEM")]),
	sourceImportId: t.Union([t.Null(), t.String()]),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Optional(t.Array(t.String())),
	tags: t.Array(TagReturn),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	type: t.Union([
		t.Literal("REFUND"),
		t.Literal("INCOME"),
		t.Literal("EXPENSE"),
		t.Literal("TRANSFER"),
		t.Literal("YIELD"),
	]),
});
export type TransactionImportDuplicateReturn = typeof TransactionImportDuplicateReturn.static;

export const TransactionImportTransferSuggestionReturn = t.Object({
	amount: t.Number(),
	createdAt: t.String(),
	date: t.String(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	destinationFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	financialAccountId: t.String(),
	id: t.String(),
	isHidden: t.Boolean(),
	originFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Array(t.String()),
	tags: t.Array(TagReturn),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	type: t.Union([
		t.Literal("REFUND"),
		t.Literal("INCOME"),
		t.Literal("EXPENSE"),
		t.Literal("TRANSFER"),
		t.Literal("YIELD"),
	]),
});
export type TransactionImportTransferSuggestionReturn =
	typeof TransactionImportTransferSuggestionReturn.static;

export const TransactionImportItemReturn = t.Object({
	amount: t.Number(),
	balanceAfter: t.Optional(t.Union([t.Null(), t.Number()])),
	createdAt: t.String(),
	creditCardName: t.Optional(t.Union([t.Null(), t.String()])),
	creditCardStatementDate: t.Optional(t.Union([t.Null(), t.String()])),
	date: t.String(),
	debtSplit: t.Optional(
		t.Union([
			t.Null(),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("SHARES"),
				ownerAmount: t.Number(),
				ownerShares: t.Union([t.Null(), t.Number()]),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						shares: t.Number(),
					}),
				),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("PERCENTAGE"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						percentage: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
			t.Object({
				currency: t.Optional(t.String()),
				mode: t.Literal("FIXED"),
				ownerAmount: t.Number(),
				ownerIncluded: t.Boolean(),
				participants: t.Array(
					t.Object({
						amount: t.Number(),
						debtPersonId: t.String(),
						debtPersonName: t.String(),
						description: t.Optional(t.String()),
						fixedAmount: t.Number(),
					}),
				),
				remainderDebtPersonId: t.Optional(t.String()),
			}),
		]),
	),
	description: t.Optional(t.Union([t.Null(), t.String()])),
	destinationFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	duplicateReason: t.Union([t.Null(), t.Literal("DATE_AMOUNT"), t.Literal("EXTERNAL_ID")]),
	duplicates: t.Array(TransactionImportDuplicateReturn),
	id: t.String(),
	isDuplicateIgnored: t.Boolean(),
	isHidden: t.Boolean(),
	isReconciled: t.Boolean(),
	isSelected: t.Boolean(),
	originFinancialAccountId: t.Optional(t.Union([t.Null(), t.String()])),
	paymentCreditCardId: t.Optional(t.Union([t.Null(), t.String()])),
	requiresPaymentCard: t.Optional(t.Boolean()),
	storeName: t.Optional(t.Union([t.Null(), t.String()])),
	tagIds: t.Array(t.String()),
	tags: t.Array(TagReturn),
	time: t.Optional(t.Union([t.Null(), t.String()])),
	transferSuggestions: t.Array(TransactionImportTransferSuggestionReturn),
	type: t.Union([
		t.Literal("REFUND"),
		t.Literal("INCOME"),
		t.Literal("EXPENSE"),
		t.Literal("TRANSFER"),
		t.Literal("YIELD"),
	]),
	updatedAt: t.String(),
});
export type TransactionImportItemReturn = typeof TransactionImportItemReturn.static;

export const TransactionImportReturn = t.Object({
	createdAt: t.String(),
	fileName: t.String(),
	financialAccountId: t.String(),
	hasMore: t.Boolean(),
	id: t.String(),
	items: t.Array(TransactionImportItemReturn),
	nextCursor: t.Union([t.Null(), t.String()]),
	pendingItemCount: t.Number(),
	periodEnd: t.Optional(t.Union([t.Null(), t.String()])),
	periodStart: t.Optional(t.Union([t.Null(), t.String()])),
	provider: t.Union([
		t.Literal("MERCADO_PAGO"),
		t.Literal("INTER"),
		t.Literal("NUBANK"),
		t.Literal("PICPAY"),
		t.Literal("BANCO_DO_BRASIL"),
	]),
	status: t.Union([t.Literal("PENDING"), t.Literal("APPROVED")]),
	updatedAt: t.String(),
});
export type TransactionImportReturn = typeof TransactionImportReturn.static;

export const TransactionImportCreateResultReturn = t.Object({
	ignoredCount: t.Number(),
	transactionImport: t.Union([t.Null(), TransactionImportReturn]),
});
export type TransactionImportCreateResultReturn = typeof TransactionImportCreateResultReturn.static;

export const TransactionImportSummaryReturn = t.Object({
	fileName: t.String(),
	id: t.String(),
	pendingItemCount: t.Number(),
});
export type TransactionImportSummaryReturn = typeof TransactionImportSummaryReturn.static;

export const UserReturn = t.Object({
	createdAt: t.String(),
	email: t.String(),
	id: t.String(),
	name: t.Optional(t.String()),
});
export type UserReturn = typeof UserReturn.static;

export const DebtSplitInputReturn = t.Union([
	t.Object({
		currency: t.Optional(t.String()),
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
		currency: t.Optional(t.String()),
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
		currency: t.Optional(t.String()),
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
]);
export type DebtSplitInputReturn = typeof DebtSplitInputReturn.static;

export const DebtSplitReturn = t.Union([
	t.Object({
		currency: t.Optional(t.String()),
		mode: t.Literal("SHARES"),
		ownerAmount: t.Number(),
		ownerShares: t.Union([t.Null(), t.Number()]),
		participants: t.Array(
			t.Object({
				amount: t.Number(),
				debtPersonId: t.String(),
				debtPersonName: t.String(),
				description: t.Optional(t.String()),
				shares: t.Number(),
			}),
		),
	}),
	t.Object({
		currency: t.Optional(t.String()),
		mode: t.Literal("PERCENTAGE"),
		ownerAmount: t.Number(),
		ownerIncluded: t.Boolean(),
		participants: t.Array(
			t.Object({
				amount: t.Number(),
				debtPersonId: t.String(),
				debtPersonName: t.String(),
				description: t.Optional(t.String()),
				percentage: t.Number(),
			}),
		),
		remainderDebtPersonId: t.Optional(t.String()),
	}),
	t.Object({
		currency: t.Optional(t.String()),
		mode: t.Literal("FIXED"),
		ownerAmount: t.Number(),
		ownerIncluded: t.Boolean(),
		participants: t.Array(
			t.Object({
				amount: t.Number(),
				debtPersonId: t.String(),
				debtPersonName: t.String(),
				description: t.Optional(t.String()),
				fixedAmount: t.Number(),
			}),
		),
		remainderDebtPersonId: t.Optional(t.String()),
	}),
]);
export type DebtSplitReturn = typeof DebtSplitReturn.static;

export const TransactionImportDuplicateReasonReturn = t.Union([
	t.Literal("DATE_AMOUNT"),
	t.Literal("EXTERNAL_ID"),
]);
export type TransactionImportDuplicateReasonReturn = typeof TransactionImportDuplicateReasonReturn.static;

export const DebtLedgerReturn = t.Object({
	people: t.Array(DebtPersonReturn),
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
});
export type DebtLedgerReturn = typeof DebtLedgerReturn.static;

export const CreditPurchaseEditDetailsReturn = t.Object({
	currency: t.Optional(t.String()),
	debtSplit: t.Union([
		t.Null(),
		t.Object({
			currency: t.Optional(t.String()),
			mode: t.Literal("SHARES"),
			ownerAmount: t.Number(),
			ownerShares: t.Union([t.Null(), t.Number()]),
			participants: t.Array(
				t.Object({
					amount: t.Number(),
					debtPersonId: t.String(),
					debtPersonName: t.String(),
					description: t.Optional(t.String()),
					shares: t.Number(),
				}),
			),
		}),
		t.Object({
			currency: t.Optional(t.String()),
			mode: t.Literal("PERCENTAGE"),
			ownerAmount: t.Number(),
			ownerIncluded: t.Boolean(),
			participants: t.Array(
				t.Object({
					amount: t.Number(),
					debtPersonId: t.String(),
					debtPersonName: t.String(),
					description: t.Optional(t.String()),
					percentage: t.Number(),
				}),
			),
			remainderDebtPersonId: t.Optional(t.String()),
		}),
		t.Object({
			currency: t.Optional(t.String()),
			mode: t.Literal("FIXED"),
			ownerAmount: t.Number(),
			ownerIncluded: t.Boolean(),
			participants: t.Array(
				t.Object({
					amount: t.Number(),
					debtPersonId: t.String(),
					debtPersonName: t.String(),
					description: t.Optional(t.String()),
					fixedAmount: t.Number(),
				}),
			),
			remainderDebtPersonId: t.Optional(t.String()),
		}),
	]),
	exchangeRate: t.Optional(t.Union([t.Null(), t.Number()])),
	externalId: t.Union([t.Null(), t.String()]),
	feeAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	fees: t.Optional(t.Array(FinancialFeeReturn)),
	id: t.String(),
	installmentImportedNumbers: t.Array(t.Number()),
	originalAmount: t.Optional(t.Union([t.Null(), t.Number()])),
	purchaseDate: t.String(),
	refinancedFromPurchaseId: t.Optional(t.Union([t.Null(), t.String()])),
	refinancingPurchaseIds: t.Optional(t.Array(t.String())),
	totalAmountCents: t.Number(),
});
export type CreditPurchaseEditDetailsReturn = typeof CreditPurchaseEditDetailsReturn.static;

export const PaymentSuggestionReturn = t.Object({
	amount: t.Number(),
	cardName: t.String(),
	creditCardId: t.String(),
	currency: t.Optional(t.String()),
	dueDate: t.String(),
	financialAccountId: t.String(),
	statementDate: t.String(),
	statementId: t.String(),
});
export type PaymentSuggestionReturn = typeof PaymentSuggestionReturn.static;
