import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { accountDefaultEligibility } from "../domain/account-default-eligibility";

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

export async function saveAccountDefaults(
	userId: string,
	accountId: string,
	preferences: { isPrimary?: boolean; isDefaultForStatements?: boolean },
	created = false,
) {
	return withRawTransaction(async query => {
		await query(`SELECT "id" FROM "user" WHERE "id"=$1 FOR UPDATE`, [userId]);
		const [account] = await query<{ type: string; isHidden: boolean }>(
			`SELECT "type","isHidden" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2`,
			[accountId, userId],
		);
		if (!account) throw new HttpException("Conta não encontrada", 404);
		const { primary: primaryEligible, statements: payerEligible } = accountDefaultEligibility(
			account.type,
			account.isHidden,
		);
		if (preferences.isPrimary && !primaryEligible)
			throw new HttpException("Selecione uma conta corrente ou dinheiro disponível", 400);
		if (preferences.isDefaultForStatements && !payerEligible)
			throw new HttpException("Selecione uma conta pagadora disponível", 400);
		let primary = preferences.isPrimary;
		if (created && primaryEligible) {
			const [existing] = await query(
				`SELECT "id" FROM "FinancialAccount" WHERE "userId"=$1 AND "isPrimary" LIMIT 1`,
				[userId],
			);
			if (!existing) primary = true;
		}
		for (const [column, enabled] of [
			["isPrimary", primary],
			["isDefaultForStatements", preferences.isDefaultForStatements],
		] as const) {
			if (enabled)
				await query(
					`UPDATE "FinancialAccount" SET "${column}"=false,"updatedAt"=NOW() WHERE "userId"=$1 AND "id"<>$2 AND "${column}"`,
					[userId, accountId],
				);
			if (enabled !== undefined)
				await query(
					`UPDATE "FinancialAccount" SET "${column}"=$3,"updatedAt"=NOW() WHERE "userId"=$1 AND "id"=$2`,
					[userId, accountId, enabled],
				);
		}
		if (!primaryEligible)
			await query(`UPDATE "FinancialAccount" SET "isPrimary"=false WHERE "id"=$1`, [accountId]);
		if (!payerEligible)
			await query(`UPDATE "FinancialAccount" SET "isDefaultForStatements"=false WHERE "id"=$1`, [accountId]);
		const [saved] = await query<{ isPrimary: boolean; isDefaultForStatements: boolean }>(
			`SELECT "isPrimary","isDefaultForStatements" FROM "FinancialAccount" WHERE "id"=$1`,
			[accountId],
		);
		return saved;
	});
}
