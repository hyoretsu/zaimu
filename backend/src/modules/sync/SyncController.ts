import Elysia from "elysia";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
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
import {
	getDebtSplitReturn,
	normalizeDebtPersonName,
	replaceDebtSplit,
	syncTransactionDebtEvent,
} from "~/modules/debts/application";
import type { DebtSplitInput } from "~/modules/debts/domain";
import {
	enqueueAccountYieldRecalculation,
	enqueueUserYieldRecalculations,
} from "~/modules/reference-rates/application/reference-rate-jobs";
import {
	db,
	executeStatement,
	nullableNumeric,
	queryFirst,
	queryRows,
	withTransaction,
} from "~/shared/infra/sql";
import { SyncBody, SyncReturn } from "./SyncDTO";

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
	normalizeTagIds(
		value<string[] | undefined>(entity, "tagIds") ??
			(value<string | undefined>(entity, "categoryId") ? [value<string>(entity, "categoryId")] : []),
	);

const accountColumns = [
	"id",
	"userId",
	"isHidden",
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
	"categoryId",
	"parentId",
	"refundOfPurchaseId",
	"isRefund",
	"createdAt",
	"updatedAt",
] as const;
const transactionColumns = [
	"id",
	"amount",
	"date",
	"description",
	"storeName",
	"type",
	"categoryId",
	"paymentCreditCardId",
	"recurrenceId",
	"recurrenceOccurrenceDate",
	"salaryId",
	"salaryOccurrenceDate",
	"subscriptionId",
	"subscriptionOccurrenceDate",
	"originFinancialAccountId",
	"destinationFinancialAccountId",
	"createdAt",
	"updatedAt",
] as const;

export const SyncController = new Elysia({ prefix: "/sync" }).post(
	"/",
	async ({ body, request }): Promise<SyncReturn> => {
		const userId = await requireUserId(request);
		return serializeUserSync(userId, async () => {
			const syncResults: Record<string, SyncGroup> = {};
			const accountIds = new Set<string>();
			const categoryIds = new Set<string>();
			const recurringIds = new Set<string>();
			const salaryIds = new Set<string>();
			const subscriptionIds = new Set<string>();
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
					value<"CASH" | "CHECKING" | "CREDIT_CARD" | "INVESTMENT" | "REWARDS" | "SAVINGS">(entity, "type") ??
					"CHECKING";
				const existing = await queryFirst(
					db.sql.public.FinancialAccount.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId)
					throw new Error(`Conta financeira ${id} pertence a outro usuário`);
				const institutionInput = value<{ name?: string } | null | undefined>(entity, "institution");
				const institution = await resolveFinancialInstitution(
					userId,
					value<string | undefined>(entity, "institutionName") ?? institutionInput?.name,
				);
				const values = {
					institutionId: institution?.id,
					isHidden: value<boolean | undefined>(entity, "isHidden") ?? false,
					name: value<string>(entity, "name"),
					type,
					updatedAt: new Date(),
					userId,
					yieldFixedRate: nullableNumeric<7, 4>(
						value<number | null | undefined>(entity, "yieldFixedRate") ??
							value<number | null | undefined>(entity, "yieldRate") ??
							null,
					),
					yieldPeriod: value<"MONTHLY" | "YEARLY" | null | undefined>(entity, "yieldPeriod") as never,
					yieldReferencePercentage: nullableNumeric<7, 4>(
						value<number | null | undefined>(entity, "yieldReferencePercentage") ?? null,
					),
					yieldReferenceType:
						value<"CDI" | "SELIC" | null | undefined>(entity, "yieldReferenceType") ??
						(value<number | null | undefined>(entity, "yieldReferenceRate") ? "CDI" : null),
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
					await executeStatement(db.sql.public.FinancialAccount.insert([{ ...values, id, userId }]).build());
				const yieldRateHistories = value<
					Array<{
						effectiveDate?: string;
						yieldPeriod?: "MONTHLY" | "YEARLY" | null;
						yieldFixedRate?: number | null;
						yieldRate?: number | null;
						yieldReferencePercentage?: number | null;
						yieldReferenceRate?: number | null;
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
						yieldFixedRate: nullableNumeric<7, 4>(history.yieldFixedRate ?? history.yieldRate ?? null),
						yieldPeriod: history.yieldPeriod as never,
						yieldReferencePercentage: nullableNumeric<7, 4>(history.yieldReferencePercentage ?? null),
						yieldReferenceType: history.yieldReferenceType ?? (history.yieldReferenceRate ? "CDI" : null),
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
					assertRewardsAccountDetails(details);
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
						recalculationDates.toSorted((left, right) => left.valueOf() - right.valueOf())[0] ?? new Date(),
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
					db.sql.public.FinancialAccount.select("id", "type")
						.where((fields, functions) =>
							functions.and(functions.eq(fields.id, financialAccountId), functions.eq(fields.userId, userId)),
						)
						.limit(1)
						.build(),
				);
				if (!account || account.type === "CREDIT_CARD") throw new Error("Conta de rendimento indisponível");
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
				if (existing && existing.userId !== userId) throw new Error(`Feriado ${id} pertence a outro usuário`);
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

			await sync("recurringPayments", body.recurringPayments, async entity => {
				const id = value<string>(entity, "id");
				const existing = await queryFirst(
					db.sql.public.RecurringPayment.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId)
					throw new Error(`Recorrência ${id} pertence a outro usuário`);
				const tagIds = entityTagIds(entity);
				if (tagIds.some(tagId => !categoryIds.has(tagId)))
					throw new Error("Uma ou mais tags estão indisponíveis");
				const financialAccountId = value<string | undefined>(entity, "financialAccountId");
				if (financialAccountId && !accountIds.has(financialAccountId))
					throw new Error(`Conta financeira ${financialAccountId} indisponível`);
				const values = {
					amount: String(value<number>(entity, "amount")),
					categoryId: tagIds[0],
					dayOfMonth:
						value<number | undefined>(entity, "dayOfMonth") ?? value<number | undefined>(entity, "day"),
					dayOfWeek: value<number | undefined>(entity, "dayOfWeek"),
					endDate: optionalDate(entity, "endDate"),
					financialAccountId,
					frequency: value<"BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY">(entity, "frequency"),
					isActive: value<boolean>(entity, "isActive") ?? true,
					name: value<string>(entity, "name"),
					paymentMethod:
						value<"BOLETO" | "CASH" | "CREDIT" | "DEBIT" | "PIX" | "TRANSFER">(entity, "paymentMethod") ??
						"DEBIT",
					startDate: new Date(value<string>(entity, "startDate")),
					updatedAt: new Date(),
				};
				if (existing)
					await executeStatement(
						db.sql.public.RecurringPayment.update(values as never)
							.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
							.build(),
					);
				else
					await executeStatement(
						db.sql.public.RecurringPayment.insert([{ ...values, id, userId }] as never).build(),
					);
				recurringIds.add(id);
				await replaceEntityTags({
					entityIds: [id],
					entityType: tagEntityType.recurringPayment,
					tagIds,
				});
				if ("debtSplit" in entity)
					await replaceDebtSplit({
						amount: Number(value<number>(entity, "amount")),
						split: value<DebtSplitInput | null>(entity, "debtSplit"),
						target: { recurringPaymentId: id },
						userId,
					});
			});

			await sync("creditCards", body.creditCards, async entity => {
				const id = value<string>(entity, "id");
				const financialAccountId = value<string>(entity, "financialAccountId");
				if (!accountIds.has(financialAccountId))
					throw new Error(`Conta financeira ${financialAccountId} indisponível`);
				const existing = await queryFirst(
					db.sql.public.CreditCard.select("id")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				const cashbackAccountId = value<null | string | undefined>(entity, "cashbackAccountId") ?? null;
				const cashbackSettings = {
					cashbackAccountId,
					cashbackRate: value<null | number | undefined>(entity, "cashbackRate") ?? null,
					cashbackYieldPeriod:
						value<"MONTHLY" | "YEARLY" | null | undefined>(entity, "cashbackYieldPeriod") ?? null,
					cashbackYieldReferencePercentage:
						value<null | number | undefined>(entity, "cashbackYieldReferencePercentage") ??
						(value<null | number | undefined>(entity, "cashbackYieldRate") ? 100 : null),
					cashbackYieldReferenceRate:
						value<null | number | undefined>(entity, "cashbackYieldReferenceRate") ??
						value<null | number | undefined>(entity, "cashbackYieldRate") ??
						null,
				};
				assertCashbackSettings(cashbackSettings);
				if (cashbackAccountId && !accountIds.has(cashbackAccountId))
					throw new Error(`Conta de cashback ${cashbackAccountId} indisponível`);
				const values = {
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
				else await executeStatement(db.sql.public.CreditCardStatement.insert([{ ...values, id }]).build());
				statementIds.add(id);
			});

			await sync("debts", body.debts, async entity => {
				const id = value<string>(entity, "id");
				const existing = await queryFirst(
					db.sql.public.Debt.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId) throw new Error(`Dívida ${id} pertence a outro usuário`);
				const values = {
					amount: String(value<number>(entity, "amount")),
					date: optionalDate(entity, "date"),
					description: value<string | undefined>(entity, "description"),
					dueDate: optionalDate(entity, "dueDate"),
					isOwedToMe: value<boolean>(entity, "isOwedToMe") ?? true,
					isPaid: value<boolean>(entity, "isPaid") ?? false,
					paidDate: optionalDate(entity, "paidDate"),
					personName: value<string>(entity, "personName"),
					updatedAt: new Date(),
				};
				if (existing)
					await executeStatement(
						db.sql.public.Debt.update(values as never)
							.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
							.build(),
					);
				else await executeStatement(db.sql.public.Debt.insert([{ ...values, id, userId }] as never).build());
				const normalizedName = normalizeDebtPersonName(values.personName);
				let person = await queryFirst(
					db.sql.public.DebtPerson.select("id", "connectionId")
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.userId, userId),
								functions.eq(fields.normalizedName, normalizedName),
							),
						)
						.limit(1)
						.build(),
				);
				if (!person)
					person = await queryFirst(
						db.sql.public.DebtPerson.insert([{ name: values.personName, normalizedName, userId }])
							.returning("id", "connectionId")
							.build(),
					);
				if (!person) throw new Error("Pessoa da dívida não criada");
				debtPersonIds.add(person.id);
				const origin = {
					amount: values.amount,
					connectionId: person.connectionId,
					createdByUserId: userId,
					date: values.date,
					debtPersonId: person.id,
					description: values.description,
					dueDate: values.dueDate,
					effect: String((values.isOwedToMe ? 1 : -1) * Number(values.amount)),
					kind: "ORIGIN" as const,
					updatedAt: new Date(),
				};
				const existingOrigin = await queryFirst(
					db.sql.public.DebtEvent.select("id")
						.where((fields, functions) => functions.eq(fields.id, id))
						.limit(1)
						.build(),
				);
				if (existingOrigin)
					await executeStatement(
						db.sql.public.DebtEvent.update(origin)
							.where((fields, functions) => functions.eq(fields.id, id))
							.build(),
					);
				else await executeStatement(db.sql.public.DebtEvent.insert([{ ...origin, id }]).build());
				if (values.isPaid) {
					const settlementId = `${id[0] === "0" ? "1" : "0"}${id.slice(1)}`;
					const existingSettlement = await queryFirst(
						db.sql.public.DebtEvent.select("id")
							.where((fields, functions) => functions.eq(fields.id, settlementId))
							.limit(1)
							.build(),
					);
					if (!existingSettlement)
						await executeStatement(
							db.sql.public.DebtEvent.insert([
								{
									...origin,
									date: values.paidDate ?? values.date,
									effect: String(-Number(origin.effect)),
									id: settlementId,
									kind: "MIGRATED_SETTLEMENT",
								},
							]).build(),
						);
				}
			});

			await sync("loans", body.loans, async entity => {
				const id = value<string>(entity, "id");
				const existing = await queryFirst(
					db.sql.public.Loan.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId)
					throw new Error(`Empréstimo ${id} pertence a outro usuário`);
				const values = {
					amortization: value<"PRICE" | "SAC" | "SACRE">(entity, "amortization") ?? "PRICE",
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

			await sync("salaries", body.salaries, async entity => {
				const id = value<string>(entity, "id");
				const tagIds = entityTagIds(entity);
				if (tagIds.some(tagId => !categoryIds.has(tagId)))
					throw new Error("Uma ou mais tags estão indisponíveis");
				const existing = await queryFirst(
					db.sql.public.Salary.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId) throw new Error(`Salário ${id} pertence a outro usuário`);
				const financialAccountId = value<string | undefined>(entity, "financialAccountId");
				if (financialAccountId && !accountIds.has(financialAccountId))
					throw new Error(`Conta financeira ${financialAccountId} indisponível`);
				const values = {
					amount: String(value<number>(entity, "amount")),
					autoGenerateFrom: new Date(
						value<string | undefined>(entity, "autoGenerateFrom") ?? value<string>(entity, "startDate"),
					),
					dayOfWeek: value<number | undefined>(entity, "dayOfWeek"),
					endDate: optionalDate(entity, "endDate"),
					financialAccountId,
					frequency:
						value<"BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY">(entity, "frequency") ?? "MONTHLY",
					isActive: value<boolean>(entity, "isActive") ?? true,
					payDay: Number(value<number>(entity, "payDay")),
					source: value<string>(entity, "source"),
					startDate: new Date(value<string>(entity, "startDate")),
					updatedAt: new Date(),
				};
				if (existing)
					await executeStatement(
						db.sql.public.Salary.update(values as never)
							.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
							.build(),
					);
				else
					await executeStatement(db.sql.public.Salary.insert([{ ...values, id, userId }] as never).build());
				salaryIds.add(id);
				await replaceEntityTags({ entityIds: [id], entityType: tagEntityType.salary, tagIds });
			});

			await sync("subscriptions", body.subscriptions, async entity => {
				const id = value<string>(entity, "id");
				const tagIds = entityTagIds(entity);
				if (tagIds.some(tagId => !categoryIds.has(tagId)))
					throw new Error("Uma ou mais tags estão indisponíveis");
				const existing = await queryFirst(
					db.sql.public.Subscription.select("id", "userId")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (existing && existing.userId !== userId)
					throw new Error(`Assinatura ${id} pertence a outro usuário`);
				const financialAccountId = value<string | undefined>(entity, "financialAccountId");
				if (financialAccountId && !accountIds.has(financialAccountId))
					throw new Error(`Conta financeira ${financialAccountId} indisponível`);
				const values = {
					amount: String(value<number>(entity, "amount")),
					billingDay: Number(value<number>(entity, "billingDay")),
					dayOfWeek: value<number | undefined>(entity, "dayOfWeek"),
					endDate: optionalDate(entity, "endDate"),
					financialAccountId,
					frequency:
						value<"BIWEEKLY" | "DAILY" | "MONTHLY" | "WEEKLY" | "YEARLY">(entity, "frequency") ?? "MONTHLY",
					isActive: value<boolean>(entity, "isActive") ?? true,
					name: value<string>(entity, "name"),
					paymentMethod:
						value<"BOLETO" | "CASH" | "CREDIT" | "DEBIT" | "PIX" | "TRANSFER">(entity, "paymentMethod") ??
						"CREDIT",
					startDate: new Date(value<string>(entity, "startDate")),
					updatedAt: new Date(),
				};
				if (existing)
					await executeStatement(
						db.sql.public.Subscription.update(values as never)
							.where((f, fn) => fn.and(fn.eq(f.id, id), fn.eq(f.userId, userId)))
							.build(),
					);
				else
					await executeStatement(
						db.sql.public.Subscription.insert([{ ...values, id, userId }] as never).build(),
					);
				subscriptionIds.add(id);
				await replaceEntityTags({ entityIds: [id], entityType: tagEntityType.subscription, tagIds });
				if ("debtSplit" in entity)
					await replaceDebtSplit({
						amount: Number(value<number>(entity, "amount")),
						split: value<DebtSplitInput | null>(entity, "debtSplit"),
						target: { subscriptionId: id },
						userId,
					});
			});

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
				const salaryId = value<string | undefined>(entity, "salaryId");
				const subscriptionId = value<string | undefined>(entity, "subscriptionId");
				if (originFinancialAccountId && !accountIds.has(originFinancialAccountId))
					throw new Error(`Conta de origem ${originFinancialAccountId} indisponível`);
				if (destinationFinancialAccountId && !accountIds.has(destinationFinancialAccountId))
					throw new Error(`Conta de destino ${destinationFinancialAccountId} indisponível`);
				if (paymentCreditCardId && !cardIds.has(paymentCreditCardId))
					throw new Error(`Cartão ${paymentCreditCardId} indisponível`);
				if (recurrenceId && !recurringIds.has(recurrenceId))
					throw new Error(`Recorrência ${recurrenceId} indisponível`);
				if (salaryId && !salaryIds.has(salaryId)) throw new Error(`Salário ${salaryId} indisponível`);
				if (subscriptionId && !subscriptionIds.has(subscriptionId))
					throw new Error(`Assinatura ${subscriptionId} indisponível`);
				let existing = await queryFirst(
					db.sql.public.Transaction.select("id")
						.where((f, fn) => fn.eq(f.id, id))
						.limit(1)
						.build(),
				);
				if (!existing)
					existing = await queryFirst(
						db.sql.public.Transaction.select("id")
							.where((f, fn) =>
								fn.and(
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
				const transactionId = existing?.id ?? id;
				const tagIds = entityTagIds(entity).filter(tagId => categoryIds.has(tagId));
				if (!existing) {
					await executeStatement(
						db.sql.public.Transaction.insert([
							{
								amount: String(value<number>(entity, "amount")),
								categoryId: tagIds[0],
								date: new Date(value<string>(entity, "date")),
								description: value<string | undefined>(entity, "description"),
								destinationFinancialAccountId,
								id,
								originFinancialAccountId,
								paymentCreditCardId,
								recurrenceId,
								recurrenceOccurrenceDate,
								salaryId,
								salaryOccurrenceDate: optionalDate(entity, "salaryOccurrenceDate"),
								storeName: value<string | undefined>(entity, "storeName"),
								subscriptionId,
								subscriptionOccurrenceDate: optionalDate(entity, "subscriptionOccurrenceDate"),
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
					amount: Number(value<number>(entity, "amount")),
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
					creditResult.errors.push(error instanceof Error ? error.message : "Falha ao sincronizar cartão");
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
			let transactionQueryBuilder = db.sql.public.Transaction.outerLeftJoin(
				db.sql.public.RecurringPayment,
				(f, fn) => fn.eq(f.Transaction.recurrenceId, f.RecurringPayment.id),
			)
				.outerLeftJoin(db.sql.public.Salary, (f, fn) => fn.eq(f.Transaction.salaryId, f.Salary.id))
				.outerLeftJoin(db.sql.public.Subscription, (f, fn) =>
					fn.eq(f.Transaction.subscriptionId, f.Subscription.id),
				)
				.select(f => ({
					amount: f.Transaction.amount,
					categoryId: f.Transaction.categoryId,
					createdAt: f.Transaction.createdAt,
					date: f.Transaction.date,
					description: f.Transaction.description,
					destinationFinancialAccountId: f.Transaction.destinationFinancialAccountId,
					id: f.Transaction.id,
					originFinancialAccountId: f.Transaction.originFinancialAccountId,
					paymentCreditCardId: f.Transaction.paymentCreditCardId,
					recurrenceId: f.Transaction.recurrenceId,
					recurrenceOccurrenceDate: f.Transaction.recurrenceOccurrenceDate,
					salaryId: f.Transaction.salaryId,
					salaryOccurrenceDate: f.Transaction.salaryOccurrenceDate,
					storeName: f.Transaction.storeName,
					subscriptionId: f.Transaction.subscriptionId,
					subscriptionOccurrenceDate: f.Transaction.subscriptionOccurrenceDate,
					type: f.Transaction.type,
					updatedAt: f.Transaction.updatedAt,
				}));
			if (serverAccountIds.length) {
				transactionQueryBuilder = transactionQueryBuilder.where((f, fn) =>
					fn.or(
						fn.in(f.originFinancialAccountId, serverAccountIds),
						fn.in(f.destinationFinancialAccountId, serverAccountIds),
						fn.eq(f.RecurringPayment.userId, userId),
						fn.eq(f.Salary.userId, userId),
						fn.eq(f.Subscription.userId, userId),
					),
				);
			} else {
				transactionQueryBuilder = transactionQueryBuilder.where((f, fn) =>
					fn.or(
						fn.eq(f.RecurringPayment.userId, userId),
						fn.eq(f.Salary.userId, userId),
						fn.eq(f.Subscription.userId, userId),
					),
				);
			}
			const transactions = await queryRows(transactionQueryBuilder.build());
			const recurringPayments = await queryRows(
				db.sql.public.RecurringPayment.select(
					"id",
					"userId",
					"name",
					"amount",
					"frequency",
					"dayOfMonth",
					"dayOfWeek",
					"startDate",
					"endDate",
					"categoryId",
					"financialAccountId",
					"paymentMethod",
					"isActive",
					"createdAt",
					"updatedAt",
				)
					.where((f, fn) => fn.eq(f.userId, userId))
					.build(),
			);
			const subscriptions = await queryRows(
				db.sql.public.Subscription.select(
					"id",
					"userId",
					"name",
					"amount",
					"billingDay",
					"dayOfWeek",
					"frequency",
					"paymentMethod",
					"financialAccountId",
					"startDate",
					"endDate",
					"isActive",
					"createdAt",
					"updatedAt",
				)
					.where((fields, functions) => functions.eq(fields.userId, userId))
					.build(),
			);
			const [recurringTags, salaryTags, subscriptionTags, transactionTags] = await Promise.all([
				getTagsByEntity(
					tagEntityType.recurringPayment,
					recurringPayments.map(payment => payment.id),
				),
				getTagsByEntity(
					tagEntityType.salary,
					(
						await queryRows(
							db.sql.public.Salary.select("id")
								.where((f, fn) => fn.eq(f.userId, userId))
								.build(),
						)
					).map(salary => salary.id),
				),
				getTagsByEntity(
					tagEntityType.subscription,
					subscriptions.map(subscription => subscription.id),
				),
				getTagsByEntity(
					tagEntityType.transaction,
					transactions.map(transaction => transaction.id),
				),
			]);

			if (cardIds.size)
				await withTransaction(executor => recalculateStatementPayments(executor, [...cardIds]));

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
					debtPeople: (
						await queryRows(
							db.sql.public.DebtPerson.select("id", "name", "normalizedName", "connectionId", "hiddenAt")
								.where((fields, functions) => functions.eq(fields.userId, userId))
								.build(),
						)
					).map(person => ({ ...person, balance: 0, events: [], isZaimuUser: Boolean(person.connectionId) })),
					debts: await queryRows(
						db.sql.public.Debt.select(
							"id",
							"userId",
							"personName",
							"amount",
							"description",
							"isOwedToMe",
							"date",
							"dueDate",
							"isPaid",
							"paidDate",
							"createdAt",
							"updatedAt",
						)
							.where((f, fn) => fn.eq(f.userId, userId))
							.build(),
					),
					financialAccounts: financialAccountsWithInstitutions,
					financialAccountYieldHolidays,
					financialAccountYields: financialAccountYields.map(yieldEntry => ({
						...yieldEntry,
						amount: yieldEntry.amount === null ? null : Number(yieldEntry.amount),
					})),
					loans: await queryRows(
						db.sql.public.Loan.select(
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
					recurringPayments: await Promise.all(
						recurringPayments.map(async payment => ({
							...payment,
							debtSplit: await getDebtSplitReturn({ recurringPaymentId: payment.id }, Number(payment.amount)),
							tagIds: (recurringTags.get(payment.id) ?? []).map(tag => tag.id),
							tags: recurringTags.get(payment.id) ?? [],
						})),
					),
					salaries: (
						await queryRows(
							db.sql.public.Salary.select(
								"id",
								"userId",
								"financialAccountId",
								"source",
								"amount",
								"frequency",
								"payDay",
								"dayOfWeek",
								"startDate",
								"autoGenerateFrom",
								"endDate",
								"isActive",
								"createdAt",
								"updatedAt",
							)
								.where((f, fn) => fn.eq(f.userId, userId))
								.build(),
						)
					).map(salary => ({
						...salary,
						tagIds: (salaryTags.get(salary.id) ?? []).map(tag => tag.id),
						tags: salaryTags.get(salary.id) ?? [],
					})),
					subscriptions: await Promise.all(
						subscriptions.map(async subscription => ({
							...subscription,
							debtSplit: await getDebtSplitReturn(
								{ subscriptionId: subscription.id },
								Number(subscription.amount),
							),
							tagIds: (subscriptionTags.get(subscription.id) ?? []).map(tag => tag.id),
							tags: subscriptionTags.get(subscription.id) ?? [],
						})),
					),
					transactions: await Promise.all(
						transactions.map(async transaction => ({
							...transaction,
							debtSplit: await getDebtSplitReturn(
								{ transactionId: transaction.id },
								Number(transaction.amount),
							),
							tagIds: (transactionTags.get(transaction.id) ?? []).map(tag => tag.id),
							tags: transactionTags.get(transaction.id) ?? [],
						})),
					),
				},
				syncResults,
			};
		});
	},
	{ body: SyncBody, detail: { tags: ["Sync"] }, response: SyncReturn },
);
