import { toMinorUnits } from "@zaimu/finance/money";
import Elysia from "elysia";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
import { saveAccountDefaults } from "~/modules/accounts/application/payment-preferences";
import { resolveFinancialInstitution } from "~/modules/accounts/application/resolve-financial-institution";
import { assertCashbackSettings } from "~/modules/accounts/domain/assert-cashback-settings";
import { assertRewardsAccountDetails } from "~/modules/accounts/domain/assert-rewards-account-details";
import { requireUserId } from "~/modules/auth";
import {
	getTagsByEntity,
	normalizeTagIds,
	replaceEntityTags,
	tagEntityType,
} from "~/modules/categories/application/tag-assignments";
import { readCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { recalculateStatementPayments } from "~/modules/creditCards/application/statement-payments";
import { syncCreditBook } from "~/modules/creditCards/application/sync-credit-book";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import {
	type FinancialFee,
	financialAccountCurrency,
	resolveFinancialMoney,
} from "~/modules/currencies/application/financial-money";
import {
	getDebtSplitReturns,
	normalizeDebtPersonName,
	syncTransactionDebtEvent,
} from "~/modules/debts/application";
import {
	listManualDebtEvents,
	syncManualDebtEvent,
} from "~/modules/debts/application/sync-manual-debt-events";
import type { DebtSplitInput } from "~/modules/debts/domain";
import {
	getStoredRecurrence,
	listRecurrences,
	presentRecurrence,
	saveRecurrence,
} from "~/modules/recurring/application/recurrences";
import type { RecurrenceBody } from "~/modules/recurring/infra/elysia/RecurrenceDTO";
import {
	enqueueAccountYieldRecalculation,
	enqueueUserYieldRecalculations,
} from "~/modules/reference-rates/application/reference-rate-jobs";
import { rejectLegacyFinancialFields, strictJsonBody } from "~/shared/infra/elysia/strict-json-body";
import { PostgresOutbox } from "~/shared/infra/outbox";
import {
	db,
	executeRaw,
	executeStatement,
	nullableNumeric,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
	withTransaction,
} from "~/shared/infra/sql";
import { SyncBody, SyncReturn } from "./SyncDTO";
import { syncEvents } from "./sync-events";

type InputEntity = Record<string, unknown>;
interface SyncGroup {
	errors: string[];
	synced: number;
}

const syncLocks = new Map<string, Promise<void>>();

async function serializeUserSync<Result>(userId: string, operation: () => Promise<Result>) {
	const previous = syncLocks.get(userId) ?? Promise.resolve();
	let release: () => void;
	const current = new Promise<void>(resolve => {
		release = resolve;
	});
	const queued = previous.then(() => current);
	syncLocks.set(userId, queued);
	await previous;
	try {
		return await operation();
	} finally {
		release!();
		if (syncLocks.get(userId) === queued) syncLocks.delete(userId);
	}
}

const value = <T>(entity: InputEntity, field: string) => entity[field] as T;
const optionalDate = (entity: InputEntity, field: string) => {
	const input = value<null | string | undefined>(entity, field);
	return input ? new Date(input) : null;
};
const syncRevision = (entity: InputEntity) =>
	value<string | undefined>(entity, "updatedAt") ??
	value<string | undefined>(entity, "createdAt") ??
	String(Date.now());
const entityTagIds = (entity: InputEntity) =>
	normalizeTagIds(value<string[] | undefined>(entity, "tagIds") ?? []);

const accountColumns = [
	"currency",
	"id",
	"userId",
	"isHidden",
	"isPrimary",
	"isDefaultForStatements",
	"name",
	"type",
	"institutionId",
	"yieldFixedRate",
	"yieldPeriod",
	"yieldReferencePercentage",
	"yieldReferenceType",
	"yieldTaxRate",
	"createdAt",
	"updatedAt",
] as const;
const categoryColumns = [
	"id",
	"userId",
	"name",
	"color",
	"icon",
	"parentId",
	"createdAt",
	"updatedAt",
] as const;
const cardColumns = [
	"paymentAccountId",
	"paymentSuggestionsEnabled",
	"id",
	"financialAccountId",
	"cashbackAccountId",
	"cashbackRate",
	"cashbackYieldPeriod",
	"cashbackYieldReferencePercentage",
	"cashbackYieldReferenceRate",
	"creditLimit",
	"securityDeposit",
	"excludeFromTotals",
	"statementDay",
	"dueDay",
	"workingDueDate",
	"createdAt",
	"updatedAt",
] as const;
const statementColumns = [
	"id",
	"creditCardId",
	"statementDate",
	"dueDate",
	"totalAmount",
	"paidAmount",
	"isPaid",
	"isFullySynced",
	"createdAt",
	"updatedAt",
] as const;
const purchaseColumns = [
	"isStatementCharge",
	"id",
	"statementId",
	"cashbackAccountId",
	"cashbackAmount",
	"cashbackYieldPeriod",
	"cashbackYieldReferencePercentage",
	"cashbackYieldReferenceRate",
	"description",
	"storeName",
	"totalAmount",
	"installments",
	"currentInstallment",
	"installmentAmount",
	"purchaseDate",
	"parentId",
	"refundOfPurchaseId",
	"isRefund",
	"createdAt",
	"updatedAt",
] as const;
const transactionColumns = [
	"currency",
	"originalAmount",
	"fees",
	"exchangeRate",
	"id",
	"amount",
	"date",
	"description",
	"storeName",
	"type",
	"paymentCreditCardId",
	"recurrenceId",
	"recurrenceOccurrenceDate",
	"originFinancialAccountId",
	"destinationFinancialAccountId",
	"createdAt",
	"updatedAt",
] as const;

export const SyncController = new Elysia({ prefix: "/sync" })
	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
		strictJsonBody(body, SyncBody);
	})
	.post(
		"/",
		async ({ body, request }): Promise<SyncReturn> => {
			const userId = await requireUserId(request);
			return serializeUserSync(userId, () =>
				withRawTransaction(async () => {
					const syncResults: Record<string, SyncGroup> = {};
					const accountIds = new Set<string>();
					const categoryIds = new Set<string>();
					const recurringIds = new Set<string>();
					const cardIds = new Set<string>();
					const statementIds = new Set<string>();
					const debtPersonIds = new Set<string>();
					const syncedCreditPurchaseIds = new Map<string, string>();

					const sync = async (
						group: string,
						entities: InputEntity[] | undefined,
						operation: (entity: InputEntity) => Promise<void>,
					) => {
						const result = { errors: [] as string[], synced: 0 };
						for (const entity of entities ?? []) {
							try {
								await operation(entity);
								result.synced++;
							} catch (error) {
								result.errors.push(error instanceof Error ? error.message : `Falha ao sincronizar ${group}`);
							}
						}
						syncResults[group] = result;
					};

					await sync("financialAccounts", body.financialAccounts, async entity => {
						const id = value<string>(entity, "id");
						const type =
							value<"CASH" | "CHECKING" | "CREDIT_CARD" | "INVESTMENT" | "REWARDS" | "SAVINGS">(
								entity,
								"type",
							) ?? "CHECKING";
						const existing = await queryFirst(
							db.sql.public.FinancialAccount.select("id", "userId", "currency")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error(`Conta financeira ${id} pertence a outro usuário`);
						const currency = await assertSupportedCurrency(
							value<string | undefined>(entity, "currency") ?? existing?.currency ?? "BRL",
						);
						if (existing && currency !== existing.currency)
							throw new Error("Moeda da conta existente não pode mudar pela sincronização");
						const institutionInput = value<{ name?: string } | null | undefined>(entity, "institution");
						const institution = await resolveFinancialInstitution(
							userId,
							value<string | undefined>(entity, "institutionName") ?? institutionInput?.name,
						);
						const values = {
							currency,
							institutionId: institution?.id,
							isHidden: value<boolean | undefined>(entity, "isHidden") ?? false,
							name: value<string>(entity, "name"),
							type,
							updatedAt: new Date(),
							userId,
							yieldFixedRate: nullableNumeric<7, 4>(
								value<number | null | undefined>(entity, "yieldFixedRate") ?? null,
							),
							yieldPeriod: value<"MONTHLY" | "YEARLY" | null | undefined>(entity, "yieldPeriod") as never,
							yieldReferencePercentage: nullableNumeric<7, 4>(
								value<number | null | undefined>(entity, "yieldReferencePercentage") ?? null,
							),
							yieldReferenceType:
								value<"CDI" | "SELIC" | null | undefined>(entity, "yieldReferenceType") ?? null,
							yieldTaxRate: nullableNumeric<5, 2>(
								value<number | null | undefined>(entity, "yieldTaxRate") ?? null,
							),
						};
						if (existing)
							await executeStatement(
								db.sql.public.FinancialAccount.update(values)
									.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
									.build(),
							);
						else
							await executeStatement(
								db.sql.public.FinancialAccount.insert([{ ...values, id, userId }]).build(),
							);
						await saveAccountDefaults(
							userId,
							id,
							{
								isDefaultForStatements: value<boolean | undefined>(entity, "isDefaultForStatements"),
								isPrimary: value<boolean | undefined>(entity, "isPrimary"),
							},
							!existing,
						);
						const yieldRateHistories = value<
							Array<{
								effectiveDate?: string;
								yieldPeriod?: "MONTHLY" | "YEARLY" | null;
								yieldFixedRate?: number | null;
								yieldReferencePercentage?: number | null;
								yieldReferenceType?: "CDI" | "SELIC" | null;
								yieldTaxRate?: number | null;
							}>
						>(entity, "yieldRateHistories");
						for (const history of yieldRateHistories ?? []) {
							if (!history.effectiveDate) continue;
							const effectiveDate = new Date(`${history.effectiveDate.slice(0, 10)}T00:00:00`);
							if (Number.isNaN(effectiveDate.getTime())) continue;
							const existingHistory = await queryFirst(
								db.sql.public.FinancialAccountYieldRateHistory.select("id")
									.where((fields, functions) =>
										functions.and(
											functions.eq(fields.financialAccountId, id),
											functions.eq(fields.effectiveDate, effectiveDate),
										),
									)
									.limit(1)
									.build(),
							);
							const historyValues = {
								effectiveDate,
								updatedAt: new Date(),
								yieldFixedRate: nullableNumeric<7, 4>(history.yieldFixedRate ?? null),
								yieldPeriod: history.yieldPeriod as never,
								yieldReferencePercentage: nullableNumeric<7, 4>(history.yieldReferencePercentage ?? null),
								yieldReferenceType: history.yieldReferenceType ?? null,
								yieldTaxRate: nullableNumeric<5, 2>(history.yieldTaxRate ?? null),
							};
							if (existingHistory)
								await executeStatement(
									db.sql.public.FinancialAccountYieldRateHistory.update(historyValues)
										.where((fields, functions) => functions.eq(fields.id, existingHistory.id))
										.build(),
								);
							else
								await executeStatement(
									db.sql.public.FinancialAccountYieldRateHistory.insert([
										{ ...historyValues, financialAccountId: id },
									]).build(),
								);
						}
						if (type === "REWARDS") {
							const rewardsInput = value<
								| {
										conversionAmount?: null | number;
										conversionPoints?: null | number;
										initialBalance?: number;
										kind?: "CASHBACK" | "POINTS";
								  }
								| undefined
							>(entity, "rewardsAccount");
							if (!rewardsInput?.kind) throw new Error("Informe os dados da conta de pontos ou cashback");
							const details = {
								conversionAmount: rewardsInput.conversionAmount,
								conversionPoints: rewardsInput.conversionPoints,
								initialBalance: rewardsInput.initialBalance ?? 0,
								kind: rewardsInput.kind,
							};
							assertRewardsAccountDetails(details, currency);
							const existingRewards = await queryFirst(
								db.sql.public.RewardsAccount.select("id")
									.where((fields, functions) => functions.eq(fields.financialAccountId, id))
									.limit(1)
									.build(),
							);
							const rewardsValues = {
								conversionAmount: nullableNumeric<12, 2>(details.conversionAmount ?? null),
								conversionPoints: nullableNumeric<18, 4>(details.conversionPoints ?? null),
								initialBalance: String(details.initialBalance),
								kind: details.kind,
								updatedAt: new Date(),
							};
							if (existingRewards)
								await executeStatement(
									db.sql.public.RewardsAccount.update(rewardsValues)
										.where((fields, functions) => functions.eq(fields.financialAccountId, id))
										.build(),
								);
							else
								await executeStatement(
									db.sql.public.RewardsAccount.insert([{ ...rewardsValues, financialAccountId: id }]).build(),
								);
						}
						if (type !== "CREDIT_CARD") {
							const recalculationDates = [
								optionalDate(entity, "createdAt"),
								...(yieldRateHistories ?? []).map(history =>
									history.effectiveDate ? new Date(`${history.effectiveDate.slice(0, 10)}T00:00:00`) : null,
								),
							].filter((date): date is Date => Boolean(date && !Number.isNaN(date.valueOf())));
							await enqueueAccountYieldRecalculation(
								id,
								recalculationDates.toSorted((left, right) => left.valueOf() - right.valueOf())[0] ??
									new Date(),
								`sync-account:${id}:${syncRevision(entity)}`,
							);
						}
						accountIds.add(id);
					});

					await sync("financialAccountYields", body.financialAccountYields, async entity => {
						const id = value<string>(entity, "id");
						const financialAccountId = value<string>(entity, "financialAccountId");
						const date = optionalDate(entity, "date");
						const kind = value<"AUTOMATIC" | "MANUAL">(entity, "kind");
						if (!date || !kind) throw new Error("Informe os dados do rendimento");
						const account = await queryFirst(
							db.sql.public.FinancialAccount.select("id", "type", "currency")
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.id, financialAccountId),
										functions.eq(fields.userId, userId),
									),
								)
								.limit(1)
								.build(),
						);
						if (!account || account.type === "CREDIT_CARD")
							throw new Error("Conta de rendimento indisponível");
						const existing = await queryFirst(
							db.sql.public.FinancialAccountYield.select("id", "financialAccountId", "origin")
								.where((fields, functions) => functions.eq(fields.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.financialAccountId !== financialAccountId)
							throw new Error(`Rendimento ${id} pertence a outra conta`);
						if (existing?.origin === "SYSTEM") return;
						const values = {
							amount: nullableNumeric<12, 4>(value<number | null | undefined>(entity, "amount") ?? null),
							currency: account.currency,
							date,
							isExcluded: value<boolean | undefined>(entity, "isExcluded") ?? false,
							kind,
							origin: "USER" as const,
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.FinancialAccountYield.update(values)
									.where((fields, functions) => functions.eq(fields.id, existing.id))
									.build(),
							);
						else
							await executeStatement(
								db.sql.public.FinancialAccountYield.insert([{ ...values, financialAccountId, id }]).build(),
							);
						await enqueueAccountYieldRecalculation(
							financialAccountId,
							date,
							`sync-yield:${id}:${syncRevision(entity)}`,
						);
					});

					await sync("financialAccountYieldHolidays", body.financialAccountYieldHolidays, async entity => {
						const id = value<string>(entity, "id");
						const date = optionalDate(entity, "date");
						if (!date) throw new Error("Informe a data do feriado");
						const existing = await queryFirst(
							db.sql.public.FinancialAccountYieldHoliday.select("id", "userId")
								.where((fields, functions) => functions.eq(fields.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error(`Feriado ${id} pertence a outro usuário`);
						const values = { date, updatedAt: new Date(), userId };
						if (existing)
							await executeStatement(
								db.sql.public.FinancialAccountYieldHoliday.update(values)
									.where((fields, functions) => functions.eq(fields.id, id))
									.build(),
							);
						else
							await executeStatement(
								db.sql.public.FinancialAccountYieldHoliday.insert([{ ...values, id }]).build(),
							);
						await enqueueUserYieldRecalculations(userId, date, `sync-holiday:${id}:${syncRevision(entity)}`);
					});

					await sync("categories", body.categories, async entity => {
						const id = value<string>(entity, "id");
						const existing = await queryFirst(
							db.sql.public.Category.select("id", "userId")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error(`Categoria ${id} pertence a outro usuário`);
						const values = {
							color: value<string | undefined>(entity, "color"),
							icon: value<string | undefined>(entity, "icon"),
							name: value<string>(entity, "name"),
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.Category.update(values)
									.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
									.build(),
							);
						else await executeStatement(db.sql.public.Category.insert([{ ...values, id, userId }]).build());
						categoryIds.add(id);
					});

					await sync("debtPeople", body.debtPeople, async entity => {
						const id = value<string>(entity, "id");
						const name = value<string>(entity, "name")?.trim();
						if (!name) throw new Error("Informe o nome da pessoa");
						const existing = await queryFirst(
							db.sql.public.DebtPerson.select("id", "userId")
								.where((fields, functions) => functions.eq(fields.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error(`Pessoa da dívida ${id} pertence a outro usuário`);
						const values = {
							hiddenAt: entity.hiddenAt ? new Date(String(entity.hiddenAt)) : undefined,
							name,
							normalizedName: normalizeDebtPersonName(name),
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.DebtPerson.update(values)
									.where((fields, functions) =>
										functions.and(functions.eq(fields.id, id), functions.eq(fields.userId, userId)),
									)
									.build(),
							);
						else await executeStatement(db.sql.public.DebtPerson.insert([{ ...values, id, userId }]).build());
						debtPersonIds.add(id);
					});
					const existingDebtPeople = await queryRows(
						db.sql.public.DebtPerson.select("id")
							.where((fields, functions) => functions.eq(fields.userId, userId))
							.build(),
					);
					for (const person of existingDebtPeople) debtPersonIds.add(person.id);

					await sync("creditCards", body.creditCards, async entity => {
						const id = value<string>(entity, "id");
						const financialAccountId = value<string>(entity, "financialAccountId");
						if (!accountIds.has(financialAccountId))
							throw new Error(`Conta financeira ${financialAccountId} indisponível`);
						const existing = await queryFirst(
							db.sql.public.CreditCard.select("id", "financialAccountId", "currency")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && !accountIds.has(existing.financialAccountId))
							throw new Error("Cartão pertence a outro proprietário");
						const cardCurrency = await assertSupportedCurrency(
							value<string | undefined>(entity, "currency") ??
								existing?.currency ??
								(await financialAccountCurrency(financialAccountId)),
						);
						if (existing && existing.currency !== cardCurrency)
							throw new Error("Moeda do cartão existente não pode mudar pela sincronização");
						const cashbackAccountId = value<null | string | undefined>(entity, "cashbackAccountId") ?? null;
						const paymentAccountId = value<string | null | undefined>(entity, "paymentAccountId");
						if (paymentAccountId) {
							const [payer] = await queryRaw(
								`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND NOT "isHidden" AND "type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT')`,
								[paymentAccountId, userId],
							);
							if (!payer) throw new Error("Conta pagadora indisponível");
						}
						const cashbackSettings = {
							cashbackAccountId,
							cashbackRate: value<null | number | undefined>(entity, "cashbackRate") ?? null,
							cashbackYieldPeriod:
								value<"MONTHLY" | "YEARLY" | null | undefined>(entity, "cashbackYieldPeriod") ?? null,
							cashbackYieldReferencePercentage:
								value<null | number | undefined>(entity, "cashbackYieldReferencePercentage") ?? null,
							cashbackYieldReferenceRate:
								value<null | number | undefined>(entity, "cashbackYieldReferenceRate") ?? null,
						};
						assertCashbackSettings(cashbackSettings);
						if (cashbackAccountId && !accountIds.has(cashbackAccountId))
							throw new Error(`Conta de cashback ${cashbackAccountId} indisponível`);
						const values = {
							currency: cardCurrency,
							...(paymentAccountId !== undefined && { paymentAccountId: paymentAccountId as never }),
							cashbackAccountId,
							cashbackRate: nullableNumeric<5, 2>(cashbackSettings.cashbackRate),
							cashbackYieldPeriod: cashbackSettings.cashbackYieldPeriod,
							cashbackYieldReferencePercentage: nullableNumeric<7, 4>(
								cashbackSettings.cashbackYieldReferencePercentage,
							),
							cashbackYieldReferenceRate: nullableNumeric<7, 4>(cashbackSettings.cashbackYieldReferenceRate),
							creditLimit: String(value<number>(entity, "creditLimit")),
							dueDay: Number(value<number>(entity, "dueDay")),
							excludeFromTotals: value<boolean>(entity, "excludeFromTotals") ?? false,
							financialAccountId,
							paymentSuggestionsEnabled:
								value<boolean | undefined>(entity, "paymentSuggestionsEnabled") ?? true,
							securityDeposit: nullableNumeric<12, 2>(
								value<number | null | undefined>(entity, "securityDeposit") ?? null,
							),
							statementDay: Number(value<number>(entity, "statementDay")),
							updatedAt: new Date(),
							workingDueDate: value<boolean>(entity, "workingDueDate") ?? false,
						};
						if (existing)
							await executeStatement(
								db.sql.public.CreditCard.update(values)
									.where((f, fn) => fn.and(fn.eq(f.id, id), fn.in(f.financialAccountId, [...accountIds])))
									.build(),
							);
						else await executeStatement(db.sql.public.CreditCard.insert([{ ...values, id }]).build());
						cardIds.add(id);
					});

					await sync("creditCardStatements", body.creditCardStatements, async entity => {
						const id = value<string>(entity, "id");
						const creditCardId = value<string>(entity, "creditCardId");
						if (!cardIds.has(creditCardId)) throw new Error(`Cartão ${creditCardId} indisponível`);
						const existing = await queryFirst(
							db.sql.public.CreditCardStatement.select("id", "isFullySynced")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						const values = {
							creditCardId,
							dueDate: new Date(value<string>(entity, "dueDate")),
							isFullySynced: value<boolean>(entity, "isFullySynced") ?? existing?.isFullySynced ?? false,
							isPaid: value<boolean>(entity, "isPaid") ?? false,
							paidAmount: String(value<number>(entity, "paidAmount") ?? 0),
							statementDate: new Date(value<string>(entity, "statementDate")),
							totalAmount: String(value<number>(entity, "totalAmount") ?? 0),
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.CreditCardStatement.update(values)
									.where((f, fn) => fn.and(fn.eq(f.id, id), fn.in(f.creditCardId, [...cardIds])))
									.build(),
							);
						else
							await executeStatement(db.sql.public.CreditCardStatement.insert([{ ...values, id }]).build());
						statementIds.add(id);
					});

					await sync("debtEvents", body.debtEvents, entity =>
						syncManualDebtEvent(userId, entity as unknown as import("./SyncDTO").SyncDebtEvent),
					);
					await sync("loans", body.loans, async entity => {
						const id = value<string>(entity, "id");
						const existing = await queryFirst(
							db.sql.public.Loan.select("id", "userId", "currency")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error(`Empréstimo ${id} pertence a outro usuário`);
						if (entity.amortization !== "PRICE" && entity.amortization !== "SAC")
							throw new Error("Amortização inválida");
						const currency = await assertSupportedCurrency(
							value<string | undefined>(entity, "currency") ?? existing?.currency ?? "BRL",
						);
						if (existing && existing.currency !== currency)
							throw new Error("Moeda do empréstimo com histórico não pode ser alterada");
						const values = {
							amortization: value<"PRICE" | "SAC">(entity, "amortization") ?? "PRICE",
							currency,
							description: value<string | undefined>(entity, "description"),
							dueDay: Number(value<number>(entity, "dueDay")),
							firstDueDate: new Date(value<string>(entity, "firstDueDate")),
							installmentAmount: String(value<number>(entity, "installmentAmount")),
							interestRate: String(value<number>(entity, "interestRate")),
							lender: value<string>(entity, "lender"),
							principalAmount: String(value<number>(entity, "principalAmount")),
							startDate: new Date(value<string>(entity, "startDate")),
							totalInstallments: Number(value<number>(entity, "totalInstallments")),
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.Loan.update(values)
									.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
									.build(),
							);
						else await executeStatement(db.sql.public.Loan.insert([{ ...values, id, userId }]).build());
					});

					await sync("loanPayments", body.loanPayments, async entity => {
						const id = value<string>(entity, "id");
						const loanId = value<string>(entity, "loanId");
						const number = Number(entity.installmentNumber);
						const loan = await queryFirst(
							db.sql.public.Loan.select("id", "totalInstallments", "currency")
								.where((f, fn) => fn.and(fn.eq(f.id, loanId), fn.eq(f.userId, userId)))
								.limit(1)
								.build(),
						);
						if (!loan || !Number.isInteger(number) || number < 1 || number > loan.totalInstallments)
							throw new Error("Parcela inválida");
						const currency = value<string | undefined>(entity, "currency")?.toUpperCase() ?? loan.currency;
						if (currency !== loan.currency) throw new Error("Moeda da parcela diverge do empréstimo");
						const accountId = value<string | undefined>(entity, "financialAccountId");
						if (accountId && !accountIds.has(accountId)) throw new Error("Conta de pagamento inválida");
						const amounts = ["principalPaid", "interestPaid", "totalPaid"].map(key => Number(entity[key]));
						if (
							amounts.some(amount => !Number.isFinite(amount) || amount < 0) ||
							Math.abs(amounts[0] + amounts[1] - amounts[2]) > 0.01
						)
							throw new Error("Valores de parcela inválidos");
						const existing = await queryFirst(
							db.sql.public.LoanPayment.select("id", "loanId", "paidDate")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.loanId !== loanId)
							throw new Error("Parcela pertence a outro empréstimo");
						if (existing?.paidDate) return;
						const actual = value<number | null | undefined>(entity, "accountAmount");
						const accountCurrency = accountId ? await financialAccountCurrency(accountId) : null;
						if (actual != null) {
							if (!accountCurrency) throw new Error("Débito efetivo exige conta");
							toMinorUnits(actual, accountCurrency);
						}
						if (accountCurrency && currency !== accountCurrency && actual == null)
							throw new Error("Pagamento entre moedas exige débito efetivo");
						if (entity.accountCurrency != null && entity.accountCurrency !== accountCurrency)
							throw new Error("Moeda de débito diverge da conta");
						const fields = {
							accountAmount: actual == null ? null : String(actual),
							accountCurrency,
							advanceType: value<"FRONT" | "BACK" | undefined>(entity, "advanceType") ?? null,
							currency,
							financialAccountId: accountId ?? null,
							isAdvanced: Boolean(entity.isAdvanced),
							paidDate: optionalDate(entity, "paidDate"),
							updatedAt: new Date(),
						};
						if (existing)
							await executeStatement(
								db.sql.public.LoanPayment.update(fields)
									.where((f, fn) => fn.eq(f.id, id))
									.build(),
							);
						else
							await executeStatement(
								db.sql.public.LoanPayment.insert([
									{
										...fields,
										dueDate: new Date(value<string>(entity, "dueDate")),
										id,
										installmentNumber: number,
										interestPaid: String(amounts[1]),
										loanId,
										principalPaid: String(amounts[0]),
										totalPaid: String(amounts[2]),
									},
								]).build(),
							);
						if (accountId && fields.paidDate)
							await enqueueAccountYieldRecalculation(
								accountId,
								fields.paidDate,
								`sync-loan:${id}:${syncRevision(entity)}`,
							);
					});

					const recurrenceMappings = new Map<string, string>();
					const newRecurrenceIds = new Set<string>();
					const inputs = body.recurrences ?? [];
					await sync("recurrences", inputs, async entity => {
						const inputId = value<string>(entity, "id");
						const [existing] = await queryRaw<{ id: string; userId: string }>(
							`SELECT "id","userId" FROM "Recurrence" WHERE "id"=$1`,
							[inputId],
						);
						if (existing && existing.userId !== userId)
							throw new Error("Recorrência pertence a outro usuário");
						const id = existing?.id ?? inputId;
						const stored = existing ? await getStoredRecurrence(userId, existing.id) : undefined;
						const unchanged =
							stored &&
							entity.updatedAt &&
							new Date(String(entity.updatedAt)).getTime() <= new Date(stored.updatedAt).getTime();
						const record = unchanged
							? await presentRecurrence(stored)
							: await saveRecurrence(
									userId,
									entity as unknown as RecurrenceBody,
									existing?.id,
									existing ? undefined : { id },
									Boolean(entity.needsConfiguration),
								);
						if (!existing) newRecurrenceIds.add(record.id);
						recurringIds.add(record.id);
						recurrenceMappings.set(inputId, record.id);
					});
					for (const row of await queryRaw<{ id: string }>(
						'SELECT "id" FROM "Recurrence" WHERE "userId"=$1',
						[userId],
					))
						recurringIds.add(row.id);
					await sync("transactions", body.transactions, async entity => {
						const id = value<string>(entity, "id");
						const paymentCreditCardId = value<string | undefined>(entity, "paymentCreditCardId");
						const originFinancialAccountId = value<string | undefined>(entity, "originFinancialAccountId");
						const destinationFinancialAccountId = value<string | undefined>(
							entity,
							"destinationFinancialAccountId",
						);
						const recurrenceId = value<string | undefined>(entity, "recurrenceId");
						const recurrenceOccurrenceDate = optionalDate(entity, "recurrenceOccurrenceDate");
						if (originFinancialAccountId && !accountIds.has(originFinancialAccountId))
							throw new Error(`Conta de origem ${originFinancialAccountId} indisponível`);
						if (destinationFinancialAccountId && !accountIds.has(destinationFinancialAccountId))
							throw new Error(`Conta de destino ${destinationFinancialAccountId} indisponível`);
						if (paymentCreditCardId && !cardIds.has(paymentCreditCardId))
							throw new Error(`Cartão ${paymentCreditCardId} indisponível`);
						if (paymentCreditCardId)
							await queryRaw(`SELECT "id" FROM "CreditCard" WHERE "id"=$1 FOR UPDATE`, [paymentCreditCardId]);
						if (originFinancialAccountId)
							await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 FOR UPDATE`, [
								originFinancialAccountId,
							]);
						if (recurrenceId && !recurringIds.has(recurrenceId))
							throw new Error(`Recorrência ${recurrenceId} indisponível`);
						if (recurrenceId && recurrenceOccurrenceDate) {
							await getStoredRecurrence(userId, recurrenceId, true);
							const [identity] = await queryRaw(
								'SELECT * FROM "RecurrenceOccurrence" WHERE "recurrenceId"=$1 AND "date"=$2',
								[recurrenceId, recurrenceOccurrenceDate],
							);
							if (identity) return; // Existing snapshot and deletion marker remain authoritative.
						}
						let existing = await queryFirst(
							db.sql.public.Transaction.select("id", "userId")
								.where((f, fn) => fn.eq(f.id, id))
								.limit(1)
								.build(),
						);
						if (existing && existing.userId !== userId)
							throw new Error("Lançamento pertence a outro usuário");
						if (!existing && recurrenceId && recurrenceOccurrenceDate)
							existing = (
								await queryRaw<{ id: string; userId: string }>(
									'SELECT "id","userId" FROM "Transaction" WHERE "recurrenceId"=$1 AND "recurrenceOccurrenceDate"=$2 AND "userId"=$3',
									[recurrenceId, recurrenceOccurrenceDate, userId],
								)
							)[0];
						if (!existing && !recurrenceId)
							existing = await queryFirst(
								db.sql.public.Transaction.select("id", "userId")
									.where((f, fn) =>
										fn.and(
											fn.eq(f.userId, userId),
											fn.eq(f.amount, String(value<number>(entity, "amount"))),
											fn.eq(f.date, new Date(value<string>(entity, "date"))),
											fn.eq(f.description, value<string | null | undefined>(entity, "description") ?? null),
											fn.eq(f.destinationFinancialAccountId, destinationFinancialAccountId ?? null),
											fn.eq(f.originFinancialAccountId, originFinancialAccountId ?? null),
											fn.eq(f.storeName, value<string | null | undefined>(entity, "storeName") ?? null),
											fn.eq(f.type, value<"EXPENSE" | "INCOME" | "TRANSFER">(entity, "type") ?? "EXPENSE"),
										),
									)
									.limit(1)
									.build(),
							);
						const type = value<"EXPENSE" | "INCOME" | "TRANSFER">(entity, "type") ?? "EXPENSE";
						const money = await resolveFinancialMoney({
							amount: Number(
								value<number | undefined>(entity, "originalAmount") ?? value<number>(entity, "amount"),
							),
							currency: value<string | undefined>(entity, "currency"),
							date: value<string>(entity, "date"),
							fees: value<FinancialFee[] | undefined>(entity, "fees"),
							targetCurrency: await financialAccountCurrency(
								(type === "INCOME" ? destinationFinancialAccountId : originFinancialAccountId) ??
									destinationFinancialAccountId,
							),
						});
						const transactionId = existing?.id ?? id;
						const tagIds = entityTagIds(entity).filter(tagId => categoryIds.has(tagId));
						if (!existing) {
							await executeStatement(
								db.sql.public.Transaction.insert([
									{
										amount: String(money.amount),
										currency: money.currency,
										date: new Date(value<string>(entity, "date")),
										description: value<string | undefined>(entity, "description"),
										destinationFinancialAccountId,
										exchangeRate: String(money.exchangeRate),
										fees: money.fees,
										id,
										originalAmount: String(money.originalAmount),
										originFinancialAccountId,
										paymentCreditCardId,
										recurrenceId,
										recurrenceOccurrenceDate,
										storeName: value<string | undefined>(entity, "storeName"),
										type: value<"EXPENSE" | "INCOME" | "TRANSFER">(entity, "type") ?? "EXPENSE",
										userId,
									},
								]).build(),
							);
						}
						await replaceEntityTags({
							entityIds: [transactionId],
							entityType: tagEntityType.transaction,
							tagIds,
						});
						const debtPersonId = value<string | undefined>(entity, "debtPersonId");
						if (debtPersonId && !debtPersonIds.has(debtPersonId))
							throw new Error(`Pessoa da dívida ${debtPersonId} indisponível`);
						await syncTransactionDebtEvent({
							amount: money.amount,
							date: value<string>(entity, "date"),
							...("debtSplit" in entity
								? { debtSplit: value<DebtSplitInput | null>(entity, "debtSplit") }
								: "debtPersonId" in entity
									? { debtPersonId: debtPersonId ?? null }
									: {}),
							description: value<string | undefined>(entity, "description"),
							transactionId,
							type: value<"EXPENSE" | "INCOME" | "TRANSFER">(entity, "type") ?? "EXPENSE",
							userId,
						});
						if (recurrenceId && recurrenceOccurrenceDate)
							await executeRaw(
								'INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","transactionId") VALUES ($1,$2,$3) ON CONFLICT DO NOTHING',
								[recurrenceId, recurrenceOccurrenceDate, transactionId],
							);
						const transactionDate = new Date(value<string>(entity, "date"));
						for (const accountId of [originFinancialAccountId, destinationFinancialAccountId]) {
							if (!accountId) continue;
							await enqueueAccountYieldRecalculation(
								accountId,
								transactionDate,
								`sync-transaction:${transactionId}:${syncRevision(entity)}`,
							);
						}
					});

					const creditResult = { errors: [] as string[], synced: 0 };
					for (const book of body.creditBooks ?? []) {
						try {
							await syncCreditBook(userId, book);
							creditResult.synced++;
						} catch (error) {
							creditResult.errors.push(
								error instanceof Error ? error.message : "Falha ao sincronizar cartão",
							);
						}
					}
					syncResults.creditBooks = creditResult;

					const financialAccounts = await queryRows(
						db.sql.public.FinancialAccount.select(...accountColumns)
							.where((f, fn) => fn.eq(f.userId, userId))
							.build(),
					);
					const financialInstitutions = await queryRows(
						db.sql.public.FinancialInstitution.select("id", "name")
							.where((f, fn) => fn.eq(f.userId, userId))
							.build(),
					);
					const financialAccountYieldHolidays = await queryRows(
						db.sql.public.FinancialAccountYieldHoliday.select("id", "date")
							.where((fields, functions) => functions.eq(fields.userId, userId))
							.build(),
					);
					const financialAccountYields = financialAccounts.length
						? await queryRows(
								db.sql.public.FinancialAccountYield.select(
									"currency",
									"id",
									"financialAccountId",
									"date",
									"amount",
									"kind",
									"isExcluded",
									"origin",
								)
									.where((fields, functions) =>
										functions.in(
											fields.financialAccountId,
											financialAccounts.map(account => account.id),
										),
									)
									.build(),
							)
						: [];
					const yieldRateHistories = financialAccounts.length
						? await queryRows(
								db.sql.public.FinancialAccountYieldRateHistory.select(
									"effectiveDate",
									"financialAccountId",
									"yieldPeriod",
									"yieldFixedRate",
									"yieldReferencePercentage",
									"yieldReferenceType",
									"yieldTaxRate",
								)
									.where((fields, functions) =>
										functions.in(
											fields.financialAccountId,
											financialAccounts.map(account => account.id),
										),
									)
									.build(),
							)
						: [];
					const yieldRateHistoriesByAccountId = new Map<string, typeof yieldRateHistories>();
					for (const history of yieldRateHistories) {
						const histories = yieldRateHistoriesByAccountId.get(history.financialAccountId) ?? [];
						histories.push(history);
						yieldRateHistoriesByAccountId.set(history.financialAccountId, histories);
					}
					const institutionsById = new Map(
						financialInstitutions.map(institution => [institution.id, institution]),
					);
					const rewardsAccounts = financialAccounts.length
						? await queryRows(
								db.sql.public.RewardsAccount.select(
									"id",
									"financialAccountId",
									"kind",
									"initialBalance",
									"conversionPoints",
									"conversionAmount",
									"createdAt",
									"updatedAt",
								)
									.where((fields, functions) =>
										functions.in(
											fields.financialAccountId,
											financialAccounts.map(account => account.id),
										),
									)
									.build(),
							)
						: [];
					const rewardsAccountsByFinancialAccountId = new Map(
						rewardsAccounts.map(account => [account.financialAccountId, account]),
					);
					const balances = await getFinancialAccountBalances(financialAccounts.map(account => account.id));
					const financialAccountsWithInstitutions = financialAccounts.map(account => ({
						...account,
						balance: account.type === "CREDIT_CARD" ? null : (balances.get(account.id) ?? 0),
						institution: account.institutionId ? (institutionsById.get(account.institutionId) ?? null) : null,
						yieldRateHistories: yieldRateHistoriesByAccountId.get(account.id) ?? [],
						...(account.type === "REWARDS" && {
							rewardsAccount: rewardsAccountsByFinancialAccountId.get(account.id) ?? null,
						}),
					}));
					const serverAccountIds = financialAccounts.map(account => account.id);
					const creditCards = serverAccountIds.length
						? await queryRows(
								db.sql.public.CreditCard.select(...cardColumns)
									.where((f, fn) => fn.in(f.financialAccountId, serverAccountIds))
									.build(),
							)
						: [];
					const serverCardIds = creditCards.map(card => card.id);
					const creditCardStatements = serverCardIds.length
						? await queryRows(
								db.sql.public.CreditCardStatement.select(...statementColumns)
									.where((f, fn) => fn.in(f.creditCardId, serverCardIds))
									.build(),
							)
						: [];
					const creditBooks: SyncReturn["serverData"]["creditBooks"] = (
						await Promise.all(serverCardIds.map(cardId => readCreditBook(userId, cardId)))
					).map(book => ({
						...book,
						purchases: book.purchases.map(p => ({
							...p,
							installmentAmountsCents: [...p.installmentAmountsCents],
							tagIds: [...p.tagIds],
						})),
					}));
					const transactionQueryBuilder = db.sql.public.Transaction.select(...transactionColumns).where(
						(f, fn) => fn.eq(f.userId, userId),
					);
					const transactions = await queryRows(transactionQueryBuilder.build());
					await sync("recurrenceOccurrences", body.recurrenceOccurrences, async entity => {
						const recurrenceId =
							recurrenceMappings.get(String(entity.recurrenceId)) ?? String(entity.recurrenceId);
						await getStoredRecurrence(userId, recurrenceId);
						const transaction = (
							await queryRaw(
								'SELECT "id" FROM "Transaction" WHERE "recurrenceId"=$1 AND "recurrenceOccurrenceDate"=$2 AND "userId"=$3',
								[recurrenceId, entity.date, userId],
							)
						)[0];
						const purchase = (
							await queryRaw(
								'SELECT "id" FROM "CreditPurchaseRecord" WHERE "recurrenceId"=$1 AND "recurrenceOccurrenceDate"=$2 AND "userId"=$3',
								[recurrenceId, entity.date, userId],
							)
						)[0];
						const transactionId = transaction?.id ?? null;
						const purchaseId = purchase?.id ?? null;
						if (!entity.deletedAt && !transactionId && !purchaseId)
							throw new Error("Ocorrência sem lançamento financeiro correspondente");
						if (
							transactionId &&
							!(
								await queryRaw('SELECT "id" FROM "Transaction" WHERE "id"=$1 AND "userId"=$2', [
									transactionId,
									userId,
								])
							).length &&
							!entity.deletedAt
						)
							throw new Error("Lançamento da recorrência indisponível");
						if (
							purchaseId &&
							!(
								await queryRaw('SELECT "id" FROM "CreditPurchaseRecord" WHERE "id"=$1 AND "userId"=$2', [
									purchaseId,
									userId,
								])
							).length &&
							!entity.deletedAt
						)
							throw new Error("Compra da recorrência indisponível");
						await executeRaw(
							'INSERT INTO "RecurrenceOccurrence" ("recurrenceId","date","transactionId","purchaseId","deletedAt") VALUES ($1,$2,$3,$4,$5) ON CONFLICT ("recurrenceId","date") DO UPDATE SET "deletedAt"=COALESCE("RecurrenceOccurrence"."deletedAt",EXCLUDED."deletedAt")',
							[recurrenceId, entity.date, transactionId, purchaseId, entity.deletedAt ?? null],
						);
					});

					if (inputs.length && Object.values(syncResults).some(result => result.errors.length))
						throw new Error(
							`Sincronização de recorrências incompleta: ${Object.values(syncResults)
								.flatMap(result => result.errors)
								.join("; ")}`,
						);
					// Advance imported cursors only after all concrete effects and identities have succeeded.
					for (const entity of inputs)
						if (entity.materializedThrough) {
							const cursor = String(entity.materializedThrough).slice(0, 10);
							if (cursor > new Date().toISOString().slice(0, 10))
								throw new Error("Cursor de recorrência futuro");
							const id = recurrenceMappings.get(String(entity.id));
							await executeRaw(
								`UPDATE "Recurrence" SET "materializedThrough"=${newRecurrenceIds.has(id!) ? "$1::date" : 'GREATEST("materializedThrough",$1::date)'} WHERE "id"=$2 AND "userId"=$3`,
								[cursor, id, userId],
							);
						}
					const transactionTags = await getTagsByEntity(
						tagEntityType.transaction,
						transactions.map(transaction => transaction.id),
					);

					const transactionSplits = await getDebtSplitReturns(
						"transactionId",
						transactions.map(transaction => ({ amount: Number(transaction.amount), id: transaction.id })),
					);

					if (cardIds.size)
						await withTransaction(executor => recalculateStatementPayments(executor, [...cardIds]));

					const peers = await queryRaw<{ userId: string }>(
						`SELECT CASE WHEN "requesterId" = $1 THEN "recipientId" ELSE "requesterId" END AS "userId"
					 FROM "DebtConnection" WHERE "status" IN ('PENDING', 'ACCEPTED') AND ("requesterId" = $1 OR "recipientId" = $1)`,
						[userId],
					);
					const outbox = new PostgresOutbox();
					for (const event of syncEvents(
						userId,
						syncResults,
						request.headers.get("x-correlation-id")?.slice(0, 36) || crypto.randomUUID(),
						peers.map(peer => peer.userId),
						body,
					))
						await outbox.append(event);

					return {
						serverData: {
							categories: await queryRows(
								db.sql.public.Category.select(...categoryColumns)
									.where((f, fn) => fn.eq(f.userId, userId))
									.build(),
							),
							creditBooks,
							creditCardStatements,
							creditCards,
							debtEvents: await listManualDebtEvents(userId),
							debtPeople: (
								await queryRows(
									db.sql.public.DebtPerson.select("id", "name", "normalizedName", "connectionId", "hiddenAt")
										.where((fields, functions) => functions.eq(fields.userId, userId))
										.build(),
								)
							).map(person => ({
								...person,
								balance: 0,
								events: [],
								isZaimuUser: Boolean(person.connectionId),
							})),
							financialAccounts: financialAccountsWithInstitutions,
							financialAccountYieldHolidays,
							financialAccountYields: financialAccountYields.map(yieldEntry => ({
								...yieldEntry,
								amount: yieldEntry.amount === null ? null : Number(yieldEntry.amount),
							})),
							loanPayments: (
								await queryRaw<Record<string, unknown>>(
									`SELECT payment.* FROM "LoanPayment" payment JOIN "Loan" loan ON loan."id" = payment."loanId" WHERE loan."userId" = $1`,
									[userId],
								)
							).map(payment => ({
								...payment,
								accountAmount: payment.accountAmount == null ? null : Number(payment.accountAmount),
								interestPaid: Number(payment.interestPaid),
								principalPaid: Number(payment.principalPaid),
								totalPaid: Number(payment.totalPaid),
							})),
							loans: await queryRows(
								db.sql.public.Loan.select(
									"currency",
									"id",
									"userId",
									"lender",
									"principalAmount",
									"interestRate",
									"totalInstallments",
									"installmentAmount",
									"dueDay",
									"startDate",
									"firstDueDate",
									"description",
									"amortization",
									"createdAt",
									"updatedAt",
								)
									.where((f, fn) => fn.eq(f.userId, userId))
									.build(),
							),
							recurrenceOccurrences: (
								await queryRaw(
									'SELECT o.* FROM "RecurrenceOccurrence" o JOIN "Recurrence" r ON r."id"=o."recurrenceId" WHERE r."userId"=$1',
									[userId],
								)
							).map(row => ({
								...row,
								date: (row.date as Date).toISOString().slice(0, 10),
								id: `${row.recurrenceId}:${(row.date as Date).toISOString().slice(0, 10)}`,
							})),
							recurrences: await listRecurrences(userId),

							transactions: transactions.map(transaction => ({
								...transaction,
								debtSplit: transactionSplits.get(transaction.id) ?? null,
								tagIds: (transactionTags.get(transaction.id) ?? []).map(tag => tag.id),
								tags: transactionTags.get(transaction.id) ?? [],
							})),
						},
						syncResults,
					};
				}),
			);
		},
		{ body: SyncBody, detail: { tags: ["Sync"] }, response: SyncReturn },
	);
