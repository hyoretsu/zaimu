import { moneyCents } from "@zaimu/finance/credit-book";
import { currentDateKey } from "@zaimu/finance/credit-card";
import { toMinorUnits } from "@zaimu/finance/money";
import { pendingStatementPayments } from "@zaimu/finance/payment-suggestions";
import { resolveAccountAsset } from "~/modules/accounts/application/account-assets";
import { monetaryBalancesSql } from "~/modules/accounts/application/monetary-balances-sql";
import { resolveFinancialMoney } from "~/modules/currencies/application/financial-money";
import { enqueueAccountYieldRecalculation } from "~/modules/reference-rates/application/reference-rate-jobs";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction, withTransaction } from "~/shared/infra/sql";
import { hasPaymentBalance } from "../domain/statement-balance";
import { loadCreditBook, readCreditBook } from "./normalized-credit-book";
import { presentSuggestedPayment } from "./present-suggested-payment";
import { recalculateStatementPayments } from "./statement-payments";

export async function getPaymentSuggestions(userId: string) {
	const cards = await queryRaw<{ id: string; paymentAccountId: string; cardName: string }>(
		`
SELECT c."id", COALESCE(c."paymentAccountId",s."id",p."id") AS "paymentAccountId", COALESCE(a."name",i."name",'Cartão de crédito') AS "cardName"
FROM "CreditCard" c JOIN "FinancialAccount" a ON a."id"=c."financialAccountId"
LEFT JOIN "FinancialInstitution" i ON i."id"=a."institutionId"
LEFT JOIN "FinancialAccount" s ON s."userId"=a."userId" AND s."isDefaultForStatements" AND NOT s."isHidden" AND s."type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT')
LEFT JOIN "FinancialAccount" p ON p."userId"=a."userId" AND p."isPrimary" AND NOT p."isHidden" AND p."type" IN ('CHECKING','CASH')
JOIN "FinancialAccount" payer ON payer."id"=COALESCE(c."paymentAccountId",s."id",p."id") AND payer."userId"=a."userId" AND NOT payer."isHidden"
WHERE a."userId"=$1 AND NOT a."isHidden" AND c."paymentSuggestionsEnabled"`,
		[userId],
	);
	return (
		await Promise.all(
			cards.map(async card =>
				pendingStatementPayments(await readCreditBook(userId, card.id, false)).map(row => ({
					...row,
					cardName: card.cardName,
					financialAccountId: card.paymentAccountId,
				})),
			),
		)
	).flat();
}

type SuggestedPaymentTransaction = Parameters<typeof presentSuggestedPayment>[0];

type ConfirmPaymentInput = import("../infra/elysia/PaymentSuggestionsDTO").ConfirmPaymentSuggestionDTO;

export async function confirmSuggestedPayment(userId: string, cardId: string, input: ConfirmPaymentInput) {
	return withRawTransaction(async query => {
		const book = await loadCreditBook(query, userId, cardId, true);
		const [previous] = await query<SuggestedPaymentTransaction>(
			`SELECT * FROM "Transaction" WHERE "id"=$1`,
			[input.attemptId],
		);
		if (previous) {
			if (
				(previous as SuggestedPaymentTransaction & { userId: string }).userId !== userId ||
				previous.paymentCreditCardId !== cardId ||
				previous.originFinancialAccountId !== input.financialAccountId ||
				moneyCents(
					Number(
						(previous as typeof previous & { paymentAmount?: number }).paymentAmount ??
							previous.amount,
					),
					1,
					book.card.currency,
				) !== moneyCents(input.amount, 1, book.card.currency) ||
				(input.accountAmount != null && Number(previous.amount) !== input.accountAmount) ||
				String(previous.date instanceof Date ? previous.date.toISOString() : previous.date).slice(
					0,
					10,
				) !== input.date
			)
				throw new HttpException("Tentativa de pagamento já utilizada", 409);
			return { transaction: presentSuggestedPayment(previous) };
		}
		const [account] = await query<{ id: string; type: string }>(
			`SELECT "id","type" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND "type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT') AND NOT "isHidden" FOR UPDATE`,
			[input.financialAccountId, userId],
		);
		if (!account) throw new HttpException("Conta pagadora indisponível", 400);
		const accountCurrency = (await resolveAccountAsset(account.id, undefined, { fiatOnly: true, userId }))
			.assetCode;
		const suggestion = pendingStatementPayments(book).find(row => row.statementId === input.statementId);
		if (!suggestion || !Number.isFinite(input.amount) || !(input.amount > 0))
			throw new HttpException("Saldo da fatura mudou. Revise o pagamento novamente", 409);
		const debitAmount =
			input.accountAmount ??
			(
				await resolveFinancialMoney({
					amount: input.amount,
					currency: book.card.currency ?? "BRL",
					date: input.date,
					targetCurrency: accountCurrency,
				})
			).amount;
		toMinorUnits(debitAmount, accountCurrency, 1);
		if (input.date <= currentDateKey()) {
			const rows = await query<{ accountId: string; assetCode: string; balance: number }>(
				monetaryBalancesSql,
				[userId, [input.date]],
			);
			const balance = Number(
				rows.find(row => row.accountId === account.id && row.assetCode === accountCurrency)
					?.balance ?? 0,
			);
			if (!hasPaymentBalance(balance, debitAmount, accountCurrency))
				throw new HttpException("Saldo insuficiente na conta pagadora na data informada", 400);
		}
		const created = await withTransaction(async executor => {
			const [transaction] = await query<SuggestedPaymentTransaction>(
				`INSERT INTO "Transaction" ("id","userId","type","amount","date","originFinancialAccountId","paymentCreditCardId","currency","bookingCurrency","originalAmount","paymentAmount","paymentCurrency","createdAt","updatedAt") VALUES ($1,$2,'EXPENSE',$3,$4,$5,$6,$7,$7,$3,$8,$9,NOW(),NOW()) RETURNING *`,
				[
					input.attemptId,
					userId,
					debitAmount,
					input.date,
					input.financialAccountId,
					cardId,
					accountCurrency,
					input.amount,
					book.card.currency ?? "BRL",
				],
			);
			await recalculateStatementPayments(executor, [cardId]);
			return { transaction: presentSuggestedPayment(transaction) };
		});
		await enqueueAccountYieldRecalculation(
			input.financialAccountId,
			new Date(`${input.date}T00:00:00`),
			`transaction:${input.attemptId}`,
		);
		return created;
	});
}
