import { HttpException } from "~/shared/errors";
import { db, executeStatement, param, queryRows, withRawTransaction } from "~/shared/infra/sql";
import { accountDefaultEligibility } from "../domain/account-default-eligibility";

export async function setPrimaryAccount(userId: string, accountId: string | null) {
	return withRawTransaction(async () => {
		await queryRows(
			db.sql.public.user
				.select("id")
				.where((f, fn) => fn.eq(f.id, userId))
				.forUpdate()
				.build(),
		);
		if (accountId) {
			const [account] = await queryRows(
				db.sql.public.FinancialAccount.select("id")
					.where((f, fn) =>
						fn.and(
							fn.eq(f.id, accountId),
							fn.eq(f.userId, userId),
							fn.in(f.type, ["CHECKING", "CASH"]),
							fn.eq(f.isHidden, false),
						),
					)
					.build(),
			);
			if (!account) throw new HttpException("Selecione uma conta corrente ou dinheiro disponível", 400);
		}
		await executeStatement(
			db.sql.public.FinancialAccount.update((f, fn) => ({
				isPrimary: fn.eq(f.id, accountId ?? ""),
				updatedAt: fn.raw`NOW()`.returns("pg/timestamp-date@1"),
			}))
				.where((f, fn) => fn.eq(f.userId, userId))
				.build(),
		);
		return { financialAccountId: accountId };
	});
}

export async function getPrimaryAccount(userId: string) {
	const [account] = await queryRows(
		db.sql.public.FinancialAccount.select("id")
			.where((f, fn) =>
				fn.and(
					fn.eq(f.userId, userId),
					fn.eq(f.isPrimary, true),
					fn.eq(f.isHidden, false),
					fn.in(f.type, ["CHECKING", "CASH"]),
				),
			)
			.limit(1)
			.build(),
	);
	return { financialAccountId: account?.id ?? null };
}

export async function setCardPayer(
	userId: string,
	cardId: string,
	accountId: string | null,
	enabled: boolean,
) {
	return withRawTransaction(async () => {
		const [card] = await queryRows(
			db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (f, fn) =>
				fn.eq(f.CreditCard.financialAccountId, f.FinancialAccount.id),
			)
				.select(f => ({ id: f.CreditCard.id }))
				.where((f, fn) =>
					fn.and(fn.eq(f.CreditCard.id, cardId), fn.eq(f.FinancialAccount.userId, userId)),
				)
				.forUpdate({ of: ["CreditCard"] })
				.build(),
		);
		if (!card) throw new HttpException("Cartão não encontrado", 404);
		if (accountId) {
			const [account] = await queryRows(
				db.sql.public.FinancialAccount.select("id")
					.where((f, fn) =>
						fn.and(
							fn.eq(f.id, accountId),
							fn.eq(f.userId, userId),
							fn.in(f.type, ["CHECKING", "CASH", "SAVINGS", "INVESTMENT"]),
							fn.eq(f.isHidden, false),
						),
					)
					.build(),
			);
			if (!account) throw new HttpException("Selecione uma conta pagadora disponível", 400);
		}
		await executeStatement(
			db.sql.public.CreditCard.update((f, fn) => ({
				paymentAccountId: fn.raw`${param(accountId, { codecId: "sql/varchar@1" })}`.returns({
					codecId: "sql/varchar@1",
					nullable: true,
				}),
				paymentSuggestionsEnabled: fn.raw`${enabled}`.returns("pg/bool@1"),
				updatedAt: fn.raw`NOW()`.returns("pg/timestamp-date@1"),
			}))
				.where((f, fn) => fn.eq(f.id, cardId))
				.build(),
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
	return withRawTransaction(async () => {
		await queryRows(
			db.sql.public.user
				.select("id")
				.where((f, fn) => fn.eq(f.id, userId))
				.forUpdate()
				.build(),
		);
		const [account] = await queryRows(
			db.sql.public.FinancialAccount.select("type", "isHidden")
				.where((f, fn) => fn.and(fn.eq(f.id, accountId), fn.eq(f.userId, userId)))
				.build(),
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
			const [existing] = await queryRows(
				db.sql.public.FinancialAccount.select("id")
					.where((f, fn) => fn.and(fn.eq(f.userId, userId), fn.eq(f.isPrimary, true)))
					.limit(1)
					.build(),
			);
			if (!existing) primary = true;
		}
		for (const [column, enabled] of [
			["isPrimary", primary],
			["isDefaultForStatements", preferences.isDefaultForStatements],
		] as const) {
			if (enabled)
				await executeStatement(
					db.sql.public.FinancialAccount.update((f, fn) => ({
						[column]: fn.raw`false`.returns("pg/bool@1"),
						updatedAt: fn.raw`NOW()`.returns("pg/timestamp-date@1"),
					}))
						.where((f, fn) =>
							fn.and(fn.eq(f.userId, userId), fn.ne(f.id, accountId), fn.eq(f[column], true)),
						)
						.build(),
				);
			if (enabled !== undefined)
				await executeStatement(
					db.sql.public.FinancialAccount.update((f, fn) => ({
						[column]: fn.raw`${enabled}`.returns("pg/bool@1"),
						updatedAt: fn.raw`NOW()`.returns("pg/timestamp-date@1"),
					}))
						.where((f, fn) => fn.and(fn.eq(f.userId, userId), fn.eq(f.id, accountId)))
						.build(),
				);
		}
		if (!primaryEligible)
			await executeStatement(
				db.sql.public.FinancialAccount.update({ isPrimary: false })
					.where((f, fn) => fn.eq(f.id, accountId))
					.build(),
			);
		if (!payerEligible)
			await executeStatement(
				db.sql.public.FinancialAccount.update({ isDefaultForStatements: false })
					.where((f, fn) => fn.eq(f.id, accountId))
					.build(),
			);
		const [saved] = await queryRows(
			db.sql.public.FinancialAccount.select("isPrimary", "isDefaultForStatements")
				.where((f, fn) => fn.eq(f.id, accountId))
				.build(),
		);
		return saved;
	});
}
