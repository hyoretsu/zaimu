import { startOfDay } from "date-fns";
import Elysia, { t } from "elysia";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
import { getFinancialInstitutionYieldPolicies } from "~/modules/accounts/application/get-financial-institution-yield-policies";
import {
	getPrimaryAccount,
	saveAccountDefaults,
	setPrimaryAccount,
} from "~/modules/accounts/application/payment-preferences";
import { resolveFinancialInstitution } from "~/modules/accounts/application/resolve-financial-institution";
import {
	scheduleFinancialAccountYieldRate,
	tomorrow,
} from "~/modules/accounts/application/schedule-financial-account-yield-rate";
import { assertCashbackSettings } from "~/modules/accounts/domain/assert-cashback-settings";
import { assertCreditCardBillingDays } from "~/modules/accounts/domain/assert-credit-card-billing-days";
import { assertFinancialAccountYieldSettings } from "~/modules/accounts/domain/assert-financial-account-yield-settings";
import { assertRewardsAccountDetails } from "~/modules/accounts/domain/assert-rewards-account-details";
import type { YieldPeriod } from "~/modules/accounts/domain/calculate-financial-account-yields";
import { assertDirectOwnership, requireUserId } from "~/modules/auth";
import { recalculateCreditCardDueDates } from "~/modules/creditCards/application/normalized-credit-book";
import { assertSupportedCurrency, defaultCurrency } from "~/modules/currencies/application/currency-defaults";
import { CurrencyDTO } from "~/modules/currencies/application/financial-money";
import { HttpException } from "~/shared/errors";
import { distributedCache } from "~/shared/infra/cache";
import { rejectLegacyFinancialFields } from "~/shared/infra/elysia/strict-json-body";
import {
	db,
	executeStatement,
	nullableNumeric,
	queryFirst,
	queryRaw,
	queryRows,
	withRawTransaction,
} from "~/shared/infra/sql";

const Id = t.String({ maxLength: 36, minLength: 1 });
const FinancialAccountType = t.Union([
	t.Literal("CHECKING"),
	t.Literal("SAVINGS"),
	t.Literal("INVESTMENT"),
	t.Literal("CASH"),
	t.Literal("CREDIT_CARD"),
	t.Literal("REWARDS"),
]);

const CashbackYieldPeriod = t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]);
const FinancialAccountYieldPeriod = t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]);
const ReferenceRateType = t.Union([t.Literal("CDI"), t.Literal("SELIC")]);
const RewardsAccountKind = t.Union([t.Literal("POINTS"), t.Literal("CASHBACK")]);
const RewardsAccountCreate = t.Object({
	conversionAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	conversionPoints: t.Optional(t.Number({ exclusiveMinimum: 0 })),
	initialBalance: t.Optional(t.Number({ minimum: 0 })),
	kind: RewardsAccountKind,
});
const CreditCardCreate = t.Object({
	cashbackAccountId: t.Optional(t.String({ maxLength: 36, minLength: 1 })),
	cashbackRate: t.Optional(t.Number({ minimum: 0 })),
	cashbackRewards: t.Optional(
		t.Object({
			conversionAmount: t.Optional(t.Number({ exclusiveMinimum: 0 })),
			conversionPoints: t.Optional(t.Number({ exclusiveMinimum: 0 })),
			kind: RewardsAccountKind,
		}),
	),
	cashbackYieldPeriod: t.Optional(t.Nullable(CashbackYieldPeriod)),
	cashbackYieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	cashbackYieldReferenceRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	creditLimit: t.Number({ minimum: 0 }),
	dueDay: t.Number({ maximum: 31, minimum: 1 }),
	excludeFromTotals: t.Optional(t.Boolean()),
	paymentAccountId: t.Optional(t.Nullable(Id)),
	paymentSuggestionsEnabled: t.Optional(t.Boolean()),
	securityDeposit: t.Optional(t.Number({ minimum: 0 })),
	statementDay: t.Number({ maximum: 31, minimum: 1 }),
	workingDueDate: t.Optional(t.Boolean()),
});

async function assertPayerOwnership(accountId: string, userId: string) {
	const [account] = await queryRaw(
		`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND NOT "isHidden" AND "type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT')`,
		[accountId, userId],
	);
	if (!account) throw new HttpException("Conta pagadora indisponível", 400);
}

async function assertRewardsAccountOwnership(accountId: string, userId: string) {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.id, accountId),
					functions.eq(fields.userId, userId),
					functions.eq(fields.type, "REWARDS"),
				),
			)
			.limit(1)
			.build(),
	);
	if (!account) throw new HttpException("Selecione uma conta de pontos ou cashback válida", 400);
}

export const AccountsController = new Elysia({ prefix: "/financial-accounts" })
	.onTransform(({ body }) => {
		rejectLegacyFinancialFields(body);
	})
	.get("/primary", async ({ request }) => getPrimaryAccount(await requireUserId(request)), {
		response: t.Object({ financialAccountId: t.Nullable(Id) }),
	})
	.put(
		"/primary",
		async ({ body, request }) => setPrimaryAccount(await requireUserId(request), body.financialAccountId),
		{
			body: t.Object({ financialAccountId: t.Nullable(Id) }),
			response: t.Object({ financialAccountId: t.Nullable(Id) }),
		},
	)
	.get(
		"/",
		async ({ request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(userId, "accounts:list", {}, async () => {
				const rows = await queryRaw<{
					account: { id: string; userId: string; type: string; institutionId: string | null };
					institution: { id: string; name: string } | null;
					card: Record<string, unknown> | null;
					rewards: Record<string, unknown> | null;
				}>(
					`
SELECT to_jsonb(account) - 'balance' AS account, to_jsonb(institution) AS institution,
 to_jsonb(card) AS card, to_jsonb(rewards) AS rewards
FROM "FinancialAccount" account
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
LEFT JOIN "CreditCard" card ON card."financialAccountId" = account."id"
LEFT JOIN "RewardsAccount" rewards ON rewards."financialAccountId" = account."id"
WHERE account."userId" = $1 ORDER BY account."name", account."id"`,
					[userId],
				);
				const policies = await getFinancialInstitutionYieldPolicies([
					...new Set(rows.flatMap(row => (row.institution ? [row.institution.id] : []))),
				]);
				const accounts = rows.map(row => row.account);
				const balances = await getFinancialAccountBalances(
					accounts.map(account => account.id),
					new Date(),
					accounts,
				);
				return rows.map(({ account, institution, card, rewards }) => ({
					...account,
					balance: account.type === "CREDIT_CARD" ? null : (balances.get(account.id) ?? 0),
					...(account.type === "CREDIT_CARD" ? { creditCard: card } : {}),
					...(account.type === "REWARDS" ? { rewardsAccount: rewards } : {}),
					institution: institution
						? { ...institution, yieldPolicies: policies.get(institution.id) ?? [] }
						: null,
				}));
			});
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { tags: ["Accounts"] },
		},
	)
	.get(
		"/:id",
		async ({ params, request, set }) => {
			const userId = await requireUserId(request);
			const cached = await distributedCache.remember(
				userId,
				"accounts:detail",
				{ id: params.id },
				async () => {
					const account = await queryFirst(
						db.sql.public.FinancialAccount.select(
							"id",
							"userId",
							"isHidden",
							"isPrimary",
							"isDefaultForStatements",
							"name",
							"type",
							"institutionId",
							"currency",
							"yieldFixedRate",
							"yieldPeriod",
							"yieldReferencePercentage",
							"yieldReferenceType",
							"yieldTaxRate",
							"createdAt",
							"updatedAt",
						)
							.where((fields, functions) =>
								functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
							)
							.limit(1)
							.build(),
					);

					if (!account) {
						throw new HttpException("FinancialAccount not found", 404);
					}

					const institution = account.institutionId
						? await queryFirst(
								db.sql.public.FinancialInstitution.select("id", "name", "currency")
									.where((fields, functions) =>
										functions.and(
											functions.eq(fields.id, account.institutionId!),
											functions.eq(fields.userId, userId),
										),
									)
									.limit(1)
									.build(),
							)
						: null;
					const institutionWithYieldPolicies = institution
						? {
								...institution,
								yieldPolicies:
									(await getFinancialInstitutionYieldPolicies([institution.id])).get(institution.id) ?? [],
							}
						: null;

					// If it's a credit card, get the credit card details
					const balance =
						account.type === "CREDIT_CARD"
							? null
							: (await getFinancialAccountBalances([account.id])).get(account.id);
					const yieldRateHistories = await queryRows(
						db.sql.public.FinancialAccountYieldRateHistory.select(
							"effectiveDate",
							"yieldFixedRate",
							"yieldPeriod",
							"yieldReferencePercentage",
							"yieldReferenceType",
							"yieldTaxRate",
						)
							.where((fields, functions) => functions.eq(fields.financialAccountId, account.id))
							.orderBy("effectiveDate", { direction: "asc" })
							.build(),
					);
					if (account.type === "CREDIT_CARD") {
						const creditCard = await queryFirst(
							db.sql.public.CreditCard.select(
								"currency",
								"paymentAccountId",
								"paymentSuggestionsEnabled",
								"cashbackAccountId",
								"cashbackRate",
								"cashbackYieldPeriod",
								"cashbackYieldReferencePercentage",
								"cashbackYieldReferenceRate",
								"id",
								"financialAccountId",
								"creditLimit",
								"securityDeposit",
								"excludeFromTotals",
								"statementDay",
								"dueDay",
								"workingDueDate",
								"createdAt",
								"updatedAt",
							)
								.where((fields, functions) => functions.eq(fields.financialAccountId, account.id))
								.limit(1)
								.build(),
						);

						return {
							...account,
							balance,
							creditCard,
							institution: institutionWithYieldPolicies,
							yieldRateHistories,
						};
					}
					if (account.type === "REWARDS") {
						const rewardsAccount = await queryFirst(
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
								.where((fields, functions) => functions.eq(fields.financialAccountId, account.id))
								.limit(1)
								.build(),
						);
						return {
							...account,
							balance,
							institution: institutionWithYieldPolicies,
							rewardsAccount,
							yieldRateHistories,
						};
					}

					return { ...account, balance, institution: institutionWithYieldPolicies, yieldRateHistories };
				},
			);
			set.headers.etag = cached.etag;
			set.headers["x-cache"] = cached.hit ? "HIT" : "MISS";
			if (request.headers.get("if-none-match") === cached.etag) {
				set.status = 304;
				return null;
			}
			return cached.value;
		},
		{
			detail: { tags: ["Accounts"] },
			params: t.Object({
				id: Id,
			}),
		},
	)
	.post(
		"/",
		async ({ body, request }) =>
			withRawTransaction(async () => {
				const userId = await requireUserId(request);
				await queryRaw(`SELECT "id" FROM "user" WHERE "id"=$1 FOR UPDATE`, [userId]);
				const type = body.type ?? "CHECKING";
				const name = body.name?.trim() || null;
				if (type === "CREDIT_CARD" && !body.creditCard)
					throw new HttpException("Informe os dados do cartão de crédito", 400);
				if (type !== "CREDIT_CARD" && body.creditCard)
					throw new HttpException("Dados de cartão exigem uma conta do tipo cartão de crédito", 400);
				if (type === "REWARDS" && !body.rewardsAccount)
					throw new HttpException("Informe os dados da conta de pontos ou cashback", 400);
				if (type !== "REWARDS" && body.rewardsAccount)
					throw new HttpException("Dados de recompensas exigem uma conta do tipo pontos/cashback", 400);
				assertFinancialAccountYieldSettings({
					type,
					yieldFixedRate: body.yieldFixedRate,
					yieldPeriod: body.yieldPeriod,
					yieldReferencePercentage: body.yieldReferencePercentage,
					yieldReferenceType: body.yieldReferenceType,
					yieldTaxRate: body.yieldTaxRate,
				});
				if (body.creditCard) {
					if (body.creditCard.paymentAccountId)
						await assertPayerOwnership(body.creditCard.paymentAccountId, userId);
					assertCreditCardBillingDays(body.creditCard.statementDay, body.creditCard.dueDay);
					assertCashbackSettings(body.creditCard);
					if (body.creditCard.cashbackAccountId)
						await assertRewardsAccountOwnership(body.creditCard.cashbackAccountId, userId);
				}
				const effectiveCurrency = await defaultCurrency(userId, request.headers.get("x-currency"));
				const institution = await resolveFinancialInstitution(
					userId,
					body.institutionName,
					effectiveCurrency,
				);
				const currency = body.currency
					? await assertSupportedCurrency(body.currency)
					: (institution?.currency ?? effectiveCurrency);
				if (body.rewardsAccount)
					assertRewardsAccountDetails(
						{
							...body.rewardsAccount,
							initialBalance: body.rewardsAccount.initialBalance ?? 0,
						},
						currency,
					);
				let cashbackAccountId = body.creditCard?.cashbackAccountId;
				if (body.creditCard?.cashbackRate && !cashbackAccountId) {
					const cashbackRewards = body.creditCard.cashbackRewards ?? { kind: "CASHBACK" as const };
					const existingRewards = await queryFirst(
						db.sql.public.FinancialAccount.select("id")
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.userId, userId),
									functions.eq(fields.type, "REWARDS"),
									institution
										? functions.eq(fields.institutionId, institution.id)
										: functions.raw`${fields.institutionId} IS NULL`.returns("pg/bool@1"),
									functions.raw`${fields.name} IS NULL`.returns("pg/bool@1"),
								),
							)
							.limit(1)
							.build(),
					);
					if (existingRewards) cashbackAccountId = existingRewards.id;
					else {
						const rewardFinancialAccount = await queryFirst(
							db.sql.public.FinancialAccount.insert([
								{
									currency,
									institutionId: institution?.id,
									name: null as never,
									type: "REWARDS",
									userId,
								},
							])
								.returning("id")
								.build(),
						);
						if (!rewardFinancialAccount) throw new HttpException("Conta de recompensa não criada", 500);
						await executeStatement(
							db.sql.public.RewardsAccount.insert([
								{
									...(cashbackRewards.conversionAmount !== undefined && {
										conversionAmount: String(cashbackRewards.conversionAmount),
									}),
									...(cashbackRewards.conversionPoints !== undefined && {
										conversionPoints: String(cashbackRewards.conversionPoints),
									}),
									financialAccountId: rewardFinancialAccount.id,
									initialBalance: "0",
									kind: cashbackRewards.kind,
								},
							]).build(),
						);
						cashbackAccountId = rewardFinancialAccount.id;
					}
				}
				const existing = await queryFirst(
					db.sql.public.FinancialAccount.select("id")
						.where((fields, functions) =>
							functions.and(
								functions.eq(fields.userId, userId),
								name === null
									? functions.raw`${fields.name} IS NULL`.returns("pg/bool@1")
									: functions.eq(fields.name, name),
								functions.eq(fields.type, type),
								institution
									? functions.eq(fields.institutionId, institution.id)
									: functions.raw`${fields.institutionId} IS NULL`.returns("pg/bool@1"),
							),
						)
						.limit(1)
						.build(),
				);

				if (existing) {
					throw new HttpException("Já existe uma conta desse tipo com este nome", 409);
				}

				const account = await queryFirst(
					db.sql.public.FinancialAccount.insert([
						{
							currency,
							institutionId: institution?.id,
							// Prisma 8 currently omits null from nullable varchar write types.
							name: name as never,
							type,
							userId,
							yieldPeriod: body.yieldPeriod ?? undefined,
							...(body.yieldFixedRate !== undefined &&
								body.yieldFixedRate !== null && { yieldFixedRate: String(body.yieldFixedRate) }),
							...(body.yieldReferencePercentage !== undefined &&
								body.yieldReferencePercentage !== null && {
									yieldReferencePercentage: String(body.yieldReferencePercentage),
								}),
							...(body.yieldReferenceType !== undefined &&
								body.yieldReferenceType !== null && {
									yieldReferenceType: body.yieldReferenceType,
								}),
							...(body.yieldTaxRate !== undefined &&
								body.yieldTaxRate !== null && { yieldTaxRate: String(body.yieldTaxRate) }),
						},
					])
						.returning(
							"id",
							"userId",
							"name",
							"type",
							"institutionId",
							"currency",
							"yieldFixedRate",
							"yieldPeriod",
							"yieldReferencePercentage",
							"yieldReferenceType",
							"yieldTaxRate",
							"createdAt",
							"updatedAt",
						)
						.build(),
				);
				if (!account) throw new HttpException("FinancialAccount not created", 500);
				Object.assign(account, await saveAccountDefaults(userId, account.id, body, true));
				if (type !== "CREDIT_CARD" && (body.yieldFixedRate || body.yieldReferenceType)) {
					await scheduleFinancialAccountYieldRate({
						effectiveDate: new Date(),
						financialAccountId: account.id,
						yieldFixedRate: body.yieldFixedRate,
						yieldPeriod: body.yieldPeriod,
						yieldReferencePercentage: body.yieldReferencePercentage,
						yieldReferenceType: body.yieldReferenceType,
						yieldTaxRate: body.yieldTaxRate,
					});
				}

				// If it's a credit card, create the credit card details
				if (type === "CREDIT_CARD" && body.creditCard) {
					const creditCard = await queryFirst(
						db.sql.public.CreditCard.insert([
							{
								cashbackAccountId,
								currency,
								paymentAccountId: body.creditCard.paymentAccountId ?? undefined,
								paymentSuggestionsEnabled: body.creditCard.paymentSuggestionsEnabled ?? true,
								...(body.creditCard.cashbackRate !== undefined && {
									cashbackRate: String(body.creditCard.cashbackRate),
								}),
								cashbackYieldPeriod: body.creditCard.cashbackYieldPeriod ?? undefined,
								...(body.creditCard.cashbackYieldReferencePercentage !== undefined &&
									body.creditCard.cashbackYieldReferencePercentage !== null && {
										cashbackYieldReferencePercentage: String(
											body.creditCard.cashbackYieldReferencePercentage,
										),
									}),
								...(body.creditCard.cashbackYieldReferenceRate !== undefined &&
									body.creditCard.cashbackYieldReferenceRate !== null && {
										cashbackYieldReferenceRate: String(body.creditCard.cashbackYieldReferenceRate),
									}),
								creditLimit: String(body.creditCard.creditLimit),
								dueDay: body.creditCard.dueDay,
								excludeFromTotals: body.creditCard.excludeFromTotals ?? false,
								financialAccountId: account.id,
								...(body.creditCard.securityDeposit !== undefined && {
									securityDeposit: String(body.creditCard.securityDeposit),
								}),
								statementDay: body.creditCard.statementDay,
								workingDueDate: body.creditCard.workingDueDate ?? false,
							},
						])
							.returning(
								"paymentAccountId",
								"paymentSuggestionsEnabled",
								"cashbackAccountId",
								"cashbackRate",
								"cashbackYieldPeriod",
								"cashbackYieldReferencePercentage",
								"cashbackYieldReferenceRate",
								"id",
								"financialAccountId",
								"creditLimit",
								"securityDeposit",
								"excludeFromTotals",
								"statementDay",
								"dueDay",
								"workingDueDate",
								"createdAt",
								"updatedAt",
							)
							.build(),
					);
					if (!creditCard) throw new HttpException("CreditCard not created", 500);

					return { ...account, balance: null, creditCard, institution };
				}
				if (type === "REWARDS" && body.rewardsAccount) {
					const rewardsAccount = await queryFirst(
						db.sql.public.RewardsAccount.insert([
							{
								...(body.rewardsAccount.conversionAmount !== undefined && {
									conversionAmount: String(body.rewardsAccount.conversionAmount),
								}),
								...(body.rewardsAccount.conversionPoints !== undefined && {
									conversionPoints: String(body.rewardsAccount.conversionPoints),
								}),
								financialAccountId: account.id,
								initialBalance: String(body.rewardsAccount.initialBalance ?? 0),
								kind: body.rewardsAccount.kind,
							},
						])
							.returning(
								"id",
								"financialAccountId",
								"kind",
								"initialBalance",
								"conversionPoints",
								"conversionAmount",
								"createdAt",
								"updatedAt",
							)
							.build(),
					);
					if (!rewardsAccount) throw new HttpException("RewardsAccount not created", 500);
					return { ...account, balance: Number(rewardsAccount.initialBalance), institution, rewardsAccount };
				}

				return { ...account, balance: 0, institution };
			}),
		{
			body: t.Object({
				creditCard: t.Optional(CreditCardCreate),
				currency: t.Optional(CurrencyDTO),
				institutionName: t.Optional(t.String({ maxLength: 100 })),
				isDefaultForStatements: t.Optional(t.Boolean()),
				isPrimary: t.Optional(t.Boolean()),
				name: t.Optional(t.Union([t.String({ maxLength: 70 }), t.Null()])),
				rewardsAccount: t.Optional(RewardsAccountCreate),
				type: t.Optional(FinancialAccountType),
				yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
				yieldPeriod: t.Optional(t.Nullable(FinancialAccountYieldPeriod)),
				yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
				yieldReferenceType: t.Optional(t.Nullable(ReferenceRateType)),
				yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
			}),
			detail: { tags: ["Accounts"] },
		},
	)
	.patch(
		"/:id",
		async ({ params, body, request }) =>
			withRawTransaction(async () => {
				const userId = await requireUserId(request);
				await queryRaw(`SELECT "id" FROM "user" WHERE "id"=$1 FOR UPDATE`, [userId]);
				await assertDirectOwnership("FinancialAccount", params.id, userId);
				const existing = await queryFirst(
					db.sql.public.FinancialAccount.select(
						"id",
						"institutionId",
						"name",
						"type",
						"userId",
						"currency",
						"yieldFixedRate",
						"yieldPeriod",
						"yieldReferencePercentage",
						"yieldReferenceType",
						"yieldTaxRate",
					)
						.where((fields, functions) => functions.eq(fields.id, params.id))
						.limit(1)
						.build(),
				);

				if (!existing) {
					throw new HttpException("FinancialAccount not found", 404);
				}
				if (body.currency) await assertSupportedCurrency(body.currency);
				if (body.currency && body.currency.toUpperCase() !== existing.currency) {
					const [history] = await queryRaw<{ used: boolean }>(
						`SELECT EXISTS(SELECT 1 FROM "Transaction" WHERE "originFinancialAccountId"=$1 OR "destinationFinancialAccountId"=$1) OR EXISTS(SELECT 1 FROM "CreditPurchaseRecord" p JOIN "CreditCard" c ON c."id"=p."creditCardId" WHERE c."financialAccountId"=$1) OR EXISTS(SELECT 1 FROM "BalanceAdjustment" WHERE "financialAccountId"=$1)
OR EXISTS(SELECT 1 FROM "FinancialAccount" WHERE "id"=$1 AND COALESCE("balance",0)<>0)
OR EXISTS(SELECT 1 FROM "CreditPurchaseRecord" WHERE "cashbackAccountId"=$1)
OR EXISTS(SELECT 1 FROM "CreditCard" WHERE "cashbackAccountId"=$1)
OR EXISTS(SELECT 1 FROM "FinancialAccountYield" WHERE "financialAccountId"=$1)
OR EXISTS(SELECT 1 FROM "LoanPayment" WHERE "financialAccountId"=$1)
OR EXISTS(SELECT 1 FROM "Recurrence" WHERE "originFinancialAccountId"=$1 OR "destinationFinancialAccountId"=$1 OR "creditCardId" IN (SELECT "id" FROM "CreditCard" WHERE "financialAccountId"=$1))
OR EXISTS(SELECT 1 FROM "CreditCard" WHERE "financialAccountId"=$1 AND COALESCE("securityDeposit",0)>0)
OR EXISTS(SELECT 1 FROM "CreditCardStatement" s JOIN "CreditCard" c ON c."id"=s."creditCardId" WHERE c."financialAccountId"=$1 AND (s."totalAmount"<>0 OR s."paidAmount"<>0)) AS used`,
						[params.id],
					);
					if (history?.used)
						throw new HttpException(
							"Conta possui histórico, saldo ou compromissos. Crie outro cadastro para usar outra moeda",
							409,
						);
				}
				if (body.creditCard && existing.type !== "CREDIT_CARD")
					throw new HttpException("Dados de cartão exigem uma conta do tipo cartão de crédito", 400);
				if (body.rewardsAccount && existing.type !== "REWARDS")
					throw new HttpException("Dados de recompensas exigem uma conta do tipo pontos/cashback", 400);
				assertFinancialAccountYieldSettings({
					type: existing.type,
					yieldFixedRate: body.yieldFixedRate === undefined ? existing.yieldFixedRate : body.yieldFixedRate,
					yieldPeriod: body.yieldPeriod === undefined ? existing.yieldPeriod : body.yieldPeriod,
					yieldReferencePercentage:
						body.yieldReferencePercentage === undefined
							? existing.yieldReferencePercentage
							: body.yieldReferencePercentage,
					yieldReferenceType:
						body.yieldReferenceType === undefined ? existing.yieldReferenceType : body.yieldReferenceType,
					yieldTaxRate: body.yieldTaxRate === undefined ? existing.yieldTaxRate : body.yieldTaxRate,
				});
				const institution =
					body.institutionName === undefined
						? existing.institutionId
							? await queryFirst(
									db.sql.public.FinancialInstitution.select("id", "name", "currency")
										.where((fields, functions) =>
											functions.and(
												functions.eq(fields.id, existing.institutionId!),
												functions.eq(fields.userId, userId),
											),
										)
										.limit(1)
										.build(),
								)
							: null
						: await resolveFinancialInstitution(userId, body.institutionName);
				const name = body.name === undefined ? existing.name : body.name?.trim() || null;
				if (body.name !== undefined || body.institutionName !== undefined) {
					const duplicate = await queryFirst(
						db.sql.public.FinancialAccount.select("id")
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.userId, existing.userId),
									name === null
										? functions.raw`${fields.name} IS NULL`.returns("pg/bool@1")
										: functions.eq(fields.name, name),
									functions.eq(fields.type, existing.type),
									institution
										? functions.eq(fields.institutionId, institution.id)
										: functions.raw`${fields.institutionId} IS NULL`.returns("pg/bool@1"),
									functions.raw`${fields.id} <> ${params.id}`.returns("pg/bool@1"),
								),
							)
							.limit(1)
							.build(),
					);
					if (duplicate) throw new HttpException("Já existe uma conta desse tipo com este nome", 409);
				}

				if (body.currency && existing.type === "CREDIT_CARD")
					await queryRaw(`UPDATE "CreditCard" SET "currency"=$2 WHERE "financialAccountId"=$1`, [
						params.id,
						body.currency.toUpperCase(),
					]);
				const account = await queryFirst(
					db.sql.public.FinancialAccount.update({
						...(body.currency !== undefined && { currency: body.currency.toUpperCase() }),
						...(body.institutionName !== undefined && {
							institutionId: (institution?.id ?? null) as never,
						}),
						// Prisma 8 currently omits null from nullable varchar write types.
						...(body.name !== undefined && { name: name as never }),
						...(body.isHidden !== undefined && { isHidden: body.isHidden }),
						...(body.yieldPeriod !== undefined && { yieldPeriod: body.yieldPeriod }),
						...(body.yieldFixedRate !== undefined && {
							yieldFixedRate: nullableNumeric<7, 4>(body.yieldFixedRate),
						}),
						...(body.yieldReferencePercentage !== undefined && {
							yieldReferencePercentage: nullableNumeric<7, 4>(body.yieldReferencePercentage),
						}),
						...(body.yieldReferenceType !== undefined && {
							yieldReferenceType: body.yieldReferenceType,
						}),
						...(body.yieldTaxRate !== undefined && {
							yieldTaxRate: nullableNumeric<5, 2>(body.yieldTaxRate),
						}),
						updatedAt: new Date(),
					})
						.where((fields, functions) => functions.eq(fields.id, params.id))
						.returning(
							"id",
							"userId",
							"isHidden",
							"isPrimary",
							"isDefaultForStatements",
							"name",
							"type",
							"institutionId",
							"currency",
							"yieldFixedRate",
							"yieldPeriod",
							"yieldReferencePercentage",
							"yieldReferenceType",
							"yieldTaxRate",
							"createdAt",
							"updatedAt",
						)
						.build(),
				);
				if (!account) throw new HttpException("FinancialAccount not found", 404);
				Object.assign(account, await saveAccountDefaults(userId, account.id, body));
				const yieldChanged =
					body.yieldPeriod !== undefined ||
					body.yieldFixedRate !== undefined ||
					body.yieldReferencePercentage !== undefined ||
					body.yieldReferenceType !== undefined ||
					body.yieldTaxRate !== undefined;
				if (yieldChanged) {
					await scheduleFinancialAccountYieldRate({
						effectiveDate: body.recalculateCurrentDay ? new Date() : tomorrow(),
						financialAccountId: account.id,
						yieldFixedRate: body.yieldFixedRate === undefined ? existing.yieldFixedRate : body.yieldFixedRate,
						yieldPeriod: (body.yieldPeriod === undefined
							? existing.yieldPeriod
							: body.yieldPeriod) as null | YieldPeriod,
						yieldReferencePercentage:
							body.yieldReferencePercentage === undefined
								? existing.yieldReferencePercentage
								: body.yieldReferencePercentage,
						yieldReferenceType:
							body.yieldReferenceType === undefined
								? (existing.yieldReferenceType as "CDI" | "SELIC" | null)
								: body.yieldReferenceType,
						yieldTaxRate: body.yieldTaxRate === undefined ? existing.yieldTaxRate : body.yieldTaxRate,
					});
					if (body.recalculateCurrentDay)
						await executeStatement(
							db.sql.public.FinancialAccountYield.delete()
								.where((fields, functions) =>
									functions.and(
										functions.eq(fields.financialAccountId, account.id),
										functions.eq(fields.date, startOfDay(new Date())),
										functions.eq(fields.kind, "AUTOMATIC"),
									),
								)
								.build(),
						);
				}

				// Update credit card if provided
				if (body.creditCard && existing.type === "CREDIT_CARD") {
					if (body.creditCard.paymentAccountId)
						await assertPayerOwnership(body.creditCard.paymentAccountId, userId);
					const existingCreditCard = await queryFirst(
						db.sql.public.CreditCard.select(
							"currency",
							"paymentAccountId",
							"paymentSuggestionsEnabled",
							"cashbackAccountId",
							"cashbackRate",
							"cashbackYieldPeriod",
							"cashbackYieldReferencePercentage",
							"cashbackYieldReferenceRate",
							"statementDay",
							"dueDay",
							"workingDueDate",
						)
							.where((fields, functions) => functions.eq(fields.financialAccountId, params.id))
							.limit(1)
							.build(),
					);
					if (!existingCreditCard) throw new HttpException("CreditCard not found", 404);
					assertCreditCardBillingDays(
						body.creditCard.statementDay ?? existingCreditCard.statementDay,
						body.creditCard.dueDay ?? existingCreditCard.dueDay,
					);
					const nextCashback = {
						cashbackAccountId:
							body.creditCard.cashbackAccountId === undefined
								? existingCreditCard.cashbackAccountId
								: body.creditCard.cashbackAccountId,
						cashbackRate:
							body.creditCard.cashbackRate === undefined
								? existingCreditCard.cashbackRate
								: body.creditCard.cashbackRate,
						cashbackYieldPeriod:
							body.creditCard.cashbackYieldPeriod === undefined
								? existingCreditCard.cashbackYieldPeriod
								: body.creditCard.cashbackYieldPeriod,
						cashbackYieldReferencePercentage:
							body.creditCard.cashbackYieldReferencePercentage === undefined
								? existingCreditCard.cashbackYieldReferencePercentage
								: body.creditCard.cashbackYieldReferencePercentage,
						cashbackYieldReferenceRate:
							body.creditCard.cashbackYieldReferenceRate === undefined
								? existingCreditCard.cashbackYieldReferenceRate
								: body.creditCard.cashbackYieldReferenceRate,
					};
					assertCashbackSettings(nextCashback);
					if (nextCashback.cashbackAccountId)
						await assertRewardsAccountOwnership(nextCashback.cashbackAccountId, userId);
					const creditCard = await queryFirst(
						db.sql.public.CreditCard.update({
							...(body.creditCard.paymentAccountId !== undefined && {
								paymentAccountId: body.creditCard.paymentAccountId as never,
							}),
							...(body.creditCard.paymentSuggestionsEnabled !== undefined && {
								paymentSuggestionsEnabled: body.creditCard.paymentSuggestionsEnabled,
							}),
							...(body.creditCard.cashbackAccountId !== undefined && {
								cashbackAccountId: body.creditCard.cashbackAccountId,
							}),
							...(body.creditCard.cashbackRate !== undefined && {
								cashbackRate: nullableNumeric<5, 2>(body.creditCard.cashbackRate),
							}),
							...(body.creditCard.cashbackYieldPeriod !== undefined && {
								cashbackYieldPeriod: body.creditCard.cashbackYieldPeriod,
							}),
							...(body.creditCard.cashbackYieldReferenceRate !== undefined && {
								cashbackYieldReferenceRate: nullableNumeric<7, 4>(body.creditCard.cashbackYieldReferenceRate),
							}),
							...(body.creditCard.cashbackYieldReferencePercentage !== undefined && {
								cashbackYieldReferencePercentage: nullableNumeric<7, 4>(
									body.creditCard.cashbackYieldReferencePercentage,
								),
							}),
							...(body.creditCard.creditLimit !== undefined && {
								creditLimit: String(body.creditCard.creditLimit),
							}),
							...(body.creditCard.statementDay !== undefined && {
								statementDay: body.creditCard.statementDay,
							}),
							...(body.creditCard.dueDay !== undefined && {
								dueDay: body.creditCard.dueDay,
							}),
							...(body.creditCard.excludeFromTotals !== undefined && {
								excludeFromTotals: body.creditCard.excludeFromTotals,
							}),
							...(body.creditCard.workingDueDate !== undefined && {
								workingDueDate: body.creditCard.workingDueDate,
							}),
							...(body.creditCard.securityDeposit !== undefined && {
								securityDeposit: String(body.creditCard.securityDeposit),
							}),
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.financialAccountId, params.id))
							.returning(
								"paymentAccountId",
								"paymentSuggestionsEnabled",
								"cashbackAccountId",
								"cashbackRate",
								"cashbackYieldPeriod",
								"cashbackYieldReferencePercentage",
								"cashbackYieldReferenceRate",
								"id",
								"financialAccountId",
								"creditLimit",
								"securityDeposit",
								"excludeFromTotals",
								"statementDay",
								"dueDay",
								"workingDueDate",
								"createdAt",
								"updatedAt",
							)
							.build(),
					);
					if (!creditCard) throw new HttpException("CreditCard not found", 404);
					if (
						creditCard.dueDay !== existingCreditCard.dueDay ||
						creditCard.statementDay !== existingCreditCard.statementDay ||
						creditCard.workingDueDate !== existingCreditCard.workingDueDate
					)
						await recalculateCreditCardDueDates(userId, creditCard.id, existingCreditCard);

					return { ...account, balance: null, creditCard, institution };
				}
				if (body.rewardsAccount && existing.type === "REWARDS") {
					const existingRewardsAccount = await queryFirst(
						db.sql.public.RewardsAccount.select(
							"conversionAmount",
							"conversionPoints",
							"initialBalance",
							"kind",
						)
							.where((fields, functions) => functions.eq(fields.financialAccountId, params.id))
							.limit(1)
							.build(),
					);
					if (!existingRewardsAccount) throw new HttpException("RewardsAccount not found", 404);
					const nextRewardsAccount = {
						conversionAmount:
							body.rewardsAccount.conversionAmount === undefined
								? existingRewardsAccount.conversionAmount
								: body.rewardsAccount.conversionAmount,
						conversionPoints:
							body.rewardsAccount.conversionPoints === undefined
								? existingRewardsAccount.conversionPoints
								: body.rewardsAccount.conversionPoints,
						initialBalance: body.rewardsAccount.initialBalance ?? existingRewardsAccount.initialBalance,
						kind: body.rewardsAccount.kind ?? existingRewardsAccount.kind,
					};
					assertRewardsAccountDetails(nextRewardsAccount, body.currency?.toUpperCase() ?? existing.currency);
					const rewardsAccount = await queryFirst(
						db.sql.public.RewardsAccount.update({
							...(body.rewardsAccount.conversionAmount !== undefined && {
								conversionAmount: nullableNumeric<12, 2>(body.rewardsAccount.conversionAmount),
							}),
							...(body.rewardsAccount.conversionPoints !== undefined && {
								conversionPoints: nullableNumeric<18, 4>(body.rewardsAccount.conversionPoints),
							}),
							...(body.rewardsAccount.initialBalance !== undefined && {
								initialBalance: String(body.rewardsAccount.initialBalance),
							}),
							...(body.rewardsAccount.kind !== undefined && { kind: body.rewardsAccount.kind }),
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.financialAccountId, params.id))
							.returning(
								"id",
								"financialAccountId",
								"kind",
								"initialBalance",
								"conversionPoints",
								"conversionAmount",
								"createdAt",
								"updatedAt",
							)
							.build(),
					);
					if (!rewardsAccount) throw new HttpException("RewardsAccount not found", 404);
					return {
						...account,
						balance: (await getFinancialAccountBalances([account.id])).get(account.id) ?? 0,
						institution,
						rewardsAccount,
					};
				}

				return {
					...account,
					balance: (await getFinancialAccountBalances([account.id])).get(account.id) ?? 0,
					institution,
				};
			}),
		{
			body: t.Object({
				creditCard: t.Optional(
					t.Object({
						cashbackAccountId: t.Optional(t.Nullable(t.String({ maxLength: 36, minLength: 1 }))),
						cashbackRate: t.Optional(t.Nullable(t.Number({ minimum: 0 }))),
						cashbackYieldPeriod: t.Optional(t.Nullable(CashbackYieldPeriod)),
						cashbackYieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						cashbackYieldReferenceRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						creditLimit: t.Optional(t.Number({ minimum: 0 })),
						dueDay: t.Optional(t.Number({ maximum: 31, minimum: 1 })),
						excludeFromTotals: t.Optional(t.Boolean()),
						paymentAccountId: t.Optional(t.Nullable(Id)),
						paymentSuggestionsEnabled: t.Optional(t.Boolean()),
						securityDeposit: t.Optional(t.Number({ minimum: 0 })),
						statementDay: t.Optional(t.Number({ maximum: 31, minimum: 1 })),
						workingDueDate: t.Optional(t.Boolean()),
					}),
				),
				currency: t.Optional(CurrencyDTO),
				institutionName: t.Optional(t.String({ maxLength: 100 })),
				isDefaultForStatements: t.Optional(t.Boolean()),
				isHidden: t.Optional(t.Boolean()),
				isPrimary: t.Optional(t.Boolean()),
				name: t.Optional(t.Union([t.String({ maxLength: 70 }), t.Null()])),
				recalculateCurrentDay: t.Optional(t.Boolean()),
				rewardsAccount: t.Optional(
					t.Object({
						conversionAmount: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						conversionPoints: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
						initialBalance: t.Optional(t.Number({ minimum: 0 })),
						kind: t.Optional(RewardsAccountKind),
					}),
				),
				yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
				yieldPeriod: t.Optional(t.Nullable(FinancialAccountYieldPeriod)),
				yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
				yieldReferenceType: t.Optional(t.Nullable(ReferenceRateType)),
				yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
			}),
			detail: { tags: ["Accounts"] },
			params: t.Object({
				id: Id,
			}),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			await assertDirectOwnership("FinancialAccount", params.id, userId);
			const existing = await queryFirst(
				db.sql.public.FinancialAccount.select("id")
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.limit(1)
					.build(),
			);

			if (!existing) {
				throw new HttpException("FinancialAccount not found", 404);
			}

			await executeStatement(
				db.sql.public.FinancialAccount.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { tags: ["Accounts"] },
			params: t.Object({
				id: Id,
			}),
		},
	);
