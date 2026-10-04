import { moneyCents, replayCreditBook } from "@zaimu/finance/credit-book";
import { pendingStatementPayments } from "@zaimu/finance/payment-suggestions";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
import { HttpException } from "~/shared/errors";
import { queryRaw, withRawTransaction, withTransaction } from "~/shared/infra/sql";
import { loadCreditBook, readCreditBook } from "./normalized-credit-book";
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
				pendingStatementPayments(await readCreditBook(userId, card.id)).map(row => ({
					...row,
					cardName: card.cardName,
					financialAccountId: card.paymentAccountId,
				})),
			),
		)
	).flat();
}

type SuggestedPaymentTransaction =
	typeof import("../infra/elysia/PaymentSuggestionsDTO").ConfirmPaymentSuggestionReturn.static.transaction;

type ConfirmPaymentInput = import("../infra/elysia/PaymentSuggestionsDTO").ConfirmPaymentSuggestionDTO;

export async function confirmSuggestedPayment(userId: string, cardId: string, input: ConfirmPaymentInput) {
	return withRawTransaction(async query => {
		const book = await loadCreditBook(query, userId, cardId, true);
		const [previous] = await query<SuggestedPaymentTransaction>(`SELECT * FROM "Transaction" WHERE "id"=$1`, [
			input.attemptId,
		]);
		if (previous) {
			if (
				(previous as SuggestedPaymentTransaction & { userId: string }).userId !== userId ||
				previous.paymentCreditCardId !== cardId ||
				previous.originFinancialAccountId !== input.financialAccountId ||
				moneyCents(Number(previous.amount)) !== moneyCents(input.amount) ||
				String(previous.date instanceof Date ? previous.date.toISOString() : previous.date).slice(0, 10) !==
					input.date
			)
				throw new HttpException("Tentativa de pagamento já utilizada", 409);
			return { transaction: presentPayment(previous) };
		}
		const [account] = await query<{ id: string; type: string }>(
			`SELECT "id","type" FROM "FinancialAccount" WHERE "id"=$1 AND "userId"=$2 AND "type" IN ('CHECKING','CASH','SAVINGS','INVESTMENT') AND NOT "isHidden" FOR UPDATE`,
			[input.financialAccountId, userId],
		);
		if (!account) throw new HttpException("Conta pagadora indisponível", 400);
		const suggestion = pendingStatementPayments(book).find(row => row.statementId === input.statementId);
		if (!suggestion || moneyCents(suggestion.amount) !== moneyCents(input.amount))
			throw new HttpException("Saldo da fatura mudou. Revise o pagamento novamente", 409);
		const datedStatement = replayCreditBook(book, input.date).statements.find(
			row => row.id === input.statementId,
		);
		if (
			!datedStatement ||
			(datedStatement.statementDate > input.date && datedStatement.carriedInAmount <= 0) ||
			moneyCents(Math.max(0, datedStatement.balanceAmount)) < moneyCents(input.amount)
		)
			throw new HttpException("Fatura indisponível para pagamento na data informada", 400);
		const balance =
			(await getFinancialAccountBalances([account.id], new Date(`${input.date}T12:00:00Z`))).get(
				account.id,
			) ?? 0;
		if (moneyCents(balance) < moneyCents(input.amount))
			throw new HttpException("Saldo insuficiente na conta pagadora na data informada", 400);
		return withTransaction(async executor => {
			const [transaction] = await query<SuggestedPaymentTransaction>(
				`INSERT INTO "Transaction" ("id","userId","type","amount","date","description","originFinancialAccountId","paymentCreditCardId","createdAt","updatedAt") VALUES ($1,$2,'EXPENSE',$3,$4,'Pagamento do cartão',$5,$6,NOW(),NOW()) RETURNING *`,
				[input.attemptId, userId, input.amount, input.date, input.financialAccountId, cardId],
			);
			await recalculateStatementPayments(executor, [cardId]);
			return { transaction: presentPayment(transaction) };
		});
	});
}

function presentPayment(transaction: SuggestedPaymentTransaction) {
	return {
		...transaction,
		amount: Number(transaction.amount),
		date: transaction.date instanceof Date ? transaction.date.toISOString().slice(0, 10) : transaction.date,
	};
}
