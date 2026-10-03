import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";

export async function setPrimaryAccount(userId: string, accountId: string | null) {
	return withRawTransaction(async query => {
		await query(`SELECT "id" FROM "user" WHERE "id"=$1 FOR UPDATE`, [userId]);
		if (accountId) {
			const [account] = await query(
				`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND "type" IN ('CHECKING','CASH') AND NOT "isHidden"`,
				[accountId, userId],
			);
			if (!account) throw new HttpException("Selecione uma conta corrente ou dinheiro disponível", 400);
		}
		await query(`UPDATE "FinancialAccount" SET "isPrimary"=("id"=$2), "updatedAt"=NOW() WHERE "userId"=$1`, [
			userId,
			accountId ?? "",
		]);
		return { financialAccountId: accountId };
	});
}

export async function getPrimaryAccount(userId: string) {
	const [account] = await queryRaw<{ id: string }>(
		`SELECT "id" FROM "FinancialAccount" WHERE "userId"=$1 AND "isPrimary" AND NOT "isHidden" AND "type" IN ('CHECKING','CASH') LIMIT 1`,
		[userId],
	);
	return { financialAccountId: account?.id ?? null };
}

export async function setCardPayer(
	userId: string,
	cardId: string,
	accountId: string | null,
	enabled: boolean,
) {
	return withRawTransaction(async query => {
		const [card] = await query(
			`SELECT c."id" FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId" WHERE c."id"=$1 AND a."userId"=$2 FOR UPDATE OF c`,
			[cardId, userId],
		);
		if (!card) throw new HttpException("Cartão não encontrado", 404);
		if (accountId) {
			const [account] = await query(
				`SELECT "id" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND "type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT') AND NOT "isHidden"`,
				[accountId, userId],
			);
			if (!account) throw new HttpException("Selecione uma conta pagadora disponível", 400);
		}
		await query(
			`UPDATE "CreditCard" SET "paymentAccountId"=$2, "paymentSuggestionsEnabled"=$3, "updatedAt"=NOW() WHERE "id"=$1`,
			[cardId, accountId, enabled],
		);
		return { paymentAccountId: accountId, paymentSuggestionsEnabled: enabled };
	});
}
