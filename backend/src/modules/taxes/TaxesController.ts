import { randomUUID } from "node:crypto";
import { validateTaxBrackets } from "@zaimu/finance/yield-tax";
import Elysia, { t } from "elysia";
import { tomorrow } from "~/modules/accounts/application/schedule-financial-account-yield-rate";
import { requireUserId } from "~/modules/auth";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { requireAdmin } from "./admin-access";
import { loadTaxCatalog } from "./catalog";

const Bracket = t.Object({
	rate: t.Number({ maximum: 100, minimum: 0 }),
	upToDays: t.Nullable(t.Integer({ minimum: 0 })),
});
const Version = t.Object({
	applicationOrder: t.Integer(),
	brackets: t.Array(Bracket),
	effectiveDate: t.String(),
});
const Definition = t.Object({
	id: t.String(),
	isActive: t.Boolean(),
	name: t.String(),
	versions: t.Array(Version),
});
const SaveTax = t.Object({
	applicationOrder: t.Integer({ maximum: 100000, minimum: 0 }),
	brackets: t.Array(Bracket, { maxItems: 100, minItems: 1 }),
	name: t.String({ maxLength: 100, minLength: 1 }),
});
async function saveTax(body: typeof SaveTax.static, id?: string) {
	try {
		validateTaxBrackets(body.brackets);
	} catch (error) {
		throw new HttpException((error as Error).message, 400);
	}
	const name = body.name.trim();
	if (!name) throw new HttpException("Informe nome do imposto", 400);
	const taxId = id ?? randomUUID();
	const date = tomorrow().toISOString().slice(0, 10);
	await withRawTransaction(async query => {
		if (id) {
			const rows = await query(`UPDATE "TaxDefinition" SET "name"=$2 WHERE "id"=$1 RETURNING "id"`, [
				id,
				name,
			]);
			if (!rows.length) throw new HttpException("Imposto não encontrado", 404);
		} else
			await query(`INSERT INTO "TaxDefinition" ("id","name","isActive") VALUES ($1,$2,true)`, [taxId, name]);
		await query(
			`INSERT INTO "TaxDefinitionVersion" ("id","taxDefinitionId","effectiveDate","applicationOrder","brackets") VALUES ($1,$2,$3,$4,$5::json) ON CONFLICT ("taxDefinitionId","effectiveDate") DO UPDATE SET "applicationOrder"=EXCLUDED."applicationOrder","brackets"=EXCLUDED."brackets"`,
			[randomUUID(), taxId, date, body.applicationOrder, JSON.stringify(body.brackets)],
		);
		const accounts = await query<{ id: string }>(
			`SELECT "id" FROM "FinancialAccount" WHERE "type" <> 'CREDIT_CARD'`,
		);
		for (const account of accounts)
			await enqueueAccountYieldRecalculation(account.id, tomorrow(), `tax:${taxId}:${Date.now()}`);
	});
	return { id: taxId };
}
export const TaxesController = new Elysia()
	.get("/tax-definitions", () => loadTaxCatalog(), { response: t.Array(Definition) })
	.get(
		"/admin/access",
		async ({ request }) => {
			const id = await requireUserId(request);
			const [user] = await queryRaw<{ role: string }>(`SELECT "role" FROM "user" WHERE "id"=$1`, [id]);
			return { role: user?.role ?? "USER" };
		},
		{ response: t.Object({ role: t.String() }) },
	)
	.post(
		"/admin/taxes",
		async ({ request, body }) => {
			await requireAdmin(request);
			return saveTax(body);
		},
		{ body: SaveTax, response: t.Object({ id: t.String() }) },
	)
	.put(
		"/admin/taxes/:id",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			return saveTax(body, params.id);
		},
		{ body: SaveTax, response: t.Object({ id: t.String() }) },
	)
	.patch(
		"/admin/taxes/:id",
		async ({ request, params, body }) => {
			await requireAdmin(request);
			const rows = await queryRaw(`UPDATE "TaxDefinition" SET "isActive"=$2 WHERE "id"=$1 RETURNING "id"`, [
				params.id,
				body.isActive,
			]);
			if (!rows.length) throw new HttpException("Imposto não encontrado", 404);
			return { success: true };
		},
		{ body: t.Object({ isActive: t.Boolean() }), response: t.Object({ success: t.Boolean() }) },
	)
	.get(
		"/admin/users",
		async ({ request, query }) => {
			await requireAdmin(request);
			const search = query.email.trim();
			if (search.length < 3) return [];
			return queryRaw<{ id: string; email: string; name: string; role: string }>(
				`SELECT "id","email","name","role" FROM "user" WHERE strpos(lower("email"),lower($1))>0 ORDER BY "email" LIMIT 20`,
				[search],
			);
		},
		{
			query: t.Object({ email: t.String({ maxLength: 320 }) }),
			response: t.Array(t.Object({ email: t.String(), id: t.String(), name: t.String(), role: t.String() })),
		},
	)
	.post(
		"/admin/users/:id/promote",
		async ({ request, params }) => {
			await requireAdmin(request);
			const rows = await queryRaw(
				`UPDATE "user" SET "role"='ADMIN',"updatedAt"=now() WHERE "id"=$1 RETURNING "id"`,
				[params.id],
			);
			if (!rows.length) throw new HttpException("Usuário não encontrado", 404);
			return { success: true };
		},
		{ response: t.Object({ success: t.Boolean() }) },
	);
