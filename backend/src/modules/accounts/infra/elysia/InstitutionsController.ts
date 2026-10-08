import Elysia, { t } from "elysia";
import { tomorrow } from "~/modules/accounts/application/schedule-financial-account-yield-rate";
import { scheduleFinancialInstitutionYieldPolicy } from "~/modules/accounts/application/schedule-financial-institution-yield-policy";
import { assertFinancialInstitutionYieldPolicy } from "~/modules/accounts/domain/assert-financial-institution-yield-policy";
import { normalizeFinancialInstitutionName } from "~/modules/accounts/domain/normalize-financial-institution-name";
import { requireUserId } from "~/modules/auth";
import { assertSupportedCurrency } from "~/modules/currencies/application/currency-defaults";
import { CurrencyDTO } from "~/modules/currencies/application/financial-money";
import { HttpException } from "~/shared/errors";
import { db, executeStatement, queryFirst } from "~/shared/infra/sql";

const Id = t.String({ maxLength: 36, minLength: 1 });
const YieldPeriod = t.Union([t.Literal("MONTHLY"), t.Literal("YEARLY")]);
const ReferenceRateType = t.Union([t.Literal("CDI"), t.Literal("SELIC")]);
const YieldRule = t.Object({
	upToBalance: t.Nullable(t.Number({ exclusiveMinimum: 0 })),
	yieldFixedRate: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	yieldReferencePercentage: t.Optional(t.Nullable(t.Number({ exclusiveMinimum: 0 }))),
	yieldReferenceType: t.Optional(t.Nullable(ReferenceRateType)),
});

export const InstitutionsController = new Elysia({ prefix: "/financial-institutions" })
	.patch(
		"/:id",
		async ({ body, params, request }) => {
			const userId = await requireUserId(request);
			const currency = body.currency ? await assertSupportedCurrency(body.currency) : undefined;
			const normalized = body.name === undefined ? null : normalizeFinancialInstitutionName(body.name);
			if (normalized && !normalized.name) throw new HttpException("Informe o nome da instituição", 400);
			const existing = await queryFirst(
				db.sql.public.FinancialInstitution.select("id", "currency")
					.where((fields, functions) =>
						functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
					)
					.limit(1)
					.build(),
			);
			if (!existing) throw new HttpException("Instituição financeira não encontrada", 404);
			if (body.yieldPolicy)
				assertFinancialInstitutionYieldPolicy({
					...body.yieldPolicy,
					currency: body.yieldPolicy.currency ?? currency ?? existing.currency,
				});
			const matching = normalized
				? await queryFirst(
						db.sql.public.FinancialInstitution.select("id", "name", "currency")
							.where((fields, functions) =>
								functions.and(
									functions.eq(fields.userId, userId),
									functions.eq(fields.normalizedName, normalized.normalizedName),
								),
							)
							.limit(1)
							.build(),
					)
				: null;
			if (matching && matching.id !== params.id) {
				await executeStatement(
					db.sql.public.FinancialAccount.update({ institutionId: matching.id, updatedAt: new Date() })
						.where((fields, functions) => functions.eq(fields.institutionId, params.id))
						.build(),
				);
				await executeStatement(
					db.sql.public.FinancialInstitution.delete()
						.where((fields, functions) => functions.eq(fields.id, params.id))
						.build(),
				);
				if (currency)
					await executeStatement(
						db.sql.public.FinancialInstitution.update({ currency })
							.where((fields, functions) => functions.eq(fields.id, matching.id))
							.build(),
					);
				return { ...matching, ...(currency && { currency }) };
			}
			const institution = normalized
				? await queryFirst(
						db.sql.public.FinancialInstitution.update({
							name: normalized.name,
							normalizedName: normalized.normalizedName,
							updatedAt: new Date(),
						})
							.where((fields, functions) => functions.eq(fields.id, params.id))
							.returning("id", "name", "currency")
							.build(),
					)
				: await queryFirst(
						db.sql.public.FinancialInstitution.select("id", "name", "currency")
							.where((fields, functions) => functions.eq(fields.id, params.id))
							.limit(1)
							.build(),
					);
			if (!institution) throw new HttpException("Instituição financeira não encontrada", 404);
			if (currency) {
				await executeStatement(
					db.sql.public.FinancialInstitution.update({ currency })
						.where((fields, functions) => functions.eq(fields.id, institution.id))
						.build(),
				);
				institution.currency = currency;
			}
			if (body.yieldPolicy)
				await scheduleFinancialInstitutionYieldPolicy({
					effectiveDate: body.recalculateCurrentDay ? new Date() : tomorrow(),
					financialInstitutionId: institution.id,
					...body.yieldPolicy,
					currency: await assertSupportedCurrency(body.yieldPolicy.currency ?? institution.currency ?? "BRL"),
				});
			return { ...institution, ...(body.yieldPolicy && { yieldPolicy: body.yieldPolicy }) };
		},
		{
			body: t.Object({
				currency: t.Optional(CurrencyDTO),
				name: t.Optional(t.String({ maxLength: 100, minLength: 1 })),
				recalculateCurrentDay: t.Optional(t.Boolean()),
				yieldPolicy: t.Optional(
					t.Object({
						currency: t.Optional(CurrencyDTO),
						rules: t.Array(YieldRule, { maxItems: 20 }),
						yieldPeriod: t.Optional(t.Nullable(YieldPeriod)),
						yieldTaxRate: t.Optional(t.Nullable(t.Number({ maximum: 100, minimum: 0 }))),
					}),
				),
			}),
			detail: { tags: ["Institutions"] },
			params: t.Object({ id: Id }),
		},
	)
	.delete(
		"/:id",
		async ({ params, request }) => {
			const userId = await requireUserId(request);
			const existing = await queryFirst(
				db.sql.public.FinancialInstitution.select("id")
					.where((fields, functions) =>
						functions.and(functions.eq(fields.id, params.id), functions.eq(fields.userId, userId)),
					)
					.limit(1)
					.build(),
			);
			if (!existing) throw new HttpException("Instituição financeira não encontrada", 404);

			await executeStatement(
				db.sql.public.FinancialAccount.update({ institutionId: null, updatedAt: new Date() })
					.where((fields, functions) => functions.eq(fields.institutionId, params.id))
					.build(),
			);
			await executeStatement(
				db.sql.public.FinancialInstitution.delete()
					.where((fields, functions) => functions.eq(fields.id, params.id))
					.build(),
			);
			return { success: true };
		},
		{
			detail: { tags: ["Institutions"] },
			params: t.Object({ id: Id }),
		},
	);
