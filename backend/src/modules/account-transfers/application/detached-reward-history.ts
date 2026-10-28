import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";

export async function detachedRewardHistory(userId: string, accountId: string, cursor?: string) {
	const owned = await queryRaw(`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2`, [
		accountId,
		userId,
	]);
	if (!owned.length) throw new HttpException("Conta não encontrada", 404);
	let after: { date: string; id: string } | null = null;
	if (cursor) {
		try {
			after = JSON.parse(Buffer.from(cursor, "base64url").toString());
			if (!after || !/^\d{4}-\d{2}-\d{2}$/.test(after.date) || !/^[a-zA-Z0-9-]{1,36}$/.test(after.id))
				throw new Error();
		} catch {
			throw new HttpException("Cursor inválido", 400);
		}
	}
	const rows = await queryRaw<{ id: string; date: string; amount: number }>(
		`SELECT "id",to_char("date",'YYYY-MM-DD') AS "date","amount" FROM "DetachedRewardCredit" WHERE "financialAccountId"=$1 AND ($2::date IS NULL OR ("date","id")<($2::date,$3::varchar)) ORDER BY "date" DESC,"id" DESC LIMIT 101`,
		[accountId, after?.date ?? null, after?.id ?? null],
	);
	const items = rows.slice(0, 100);
	const last = items.at(-1);
	return {
		items,
		nextCursor:
			rows.length > 100 && last
				? Buffer.from(JSON.stringify({ date: last.date, id: last.id })).toString("base64url")
				: null,
	};
}
