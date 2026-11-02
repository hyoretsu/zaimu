import { HttpException } from "~/shared/errors";
import { db, queryRaw, queryRows } from "~/shared/infra/sql";

/** Only direct financial neighbours of the current selection can cause a split. */
export async function relatedTransferAccounts(userId: string, accountIds: string[]) {
	const ids = [...new Set(accountIds)];
	if (!ids.length || ids.length > 500 || ids.some(id => !id || id.length > 36))
		throw new HttpException("Selecione contas válidas.", 400);
	const owned = await queryRows(
		db.sql.public.FinancialAccount.select("id")
			.where((f, fn) => fn.and(fn.eq(f.userId, userId), fn.in(f.id, ids)))
			.build(),
	);
	if (owned.length !== ids.length) throw new HttpException("Conta não encontrada", 404);
	// PostgreSQL array overlap, LATERAL expansion and ordered DISTINCT aggregation
	// preserve batched direct-neighbour discovery without multiplying application queries.
	return queryRaw<{ id: string; reasons: string[] }>(
		`
 WITH edges AS (
 SELECT ARRAY[card."financialAccountId",link.id] AS accounts,link.reason FROM "CreditCard" card
 JOIN "FinancialAccount" owner ON owner."id"=card."financialAccountId" AND owner."userId"=$1
 CROSS JOIN LATERAL (VALUES (card."paymentAccountId",'Pagamento de fatura'),(card."cashbackAccountId",'Cashback')) link(id,reason)
 UNION ALL
 SELECT ARRAY[movement."originFinancialAccountId",movement."destinationFinancialAccountId",card."financialAccountId"],CASE WHEN movement."paymentCreditCardId" IS NOT NULL THEN 'Histórico de pagamento de fatura' ELSE 'Histórico de transferências' END
 FROM "Transaction" movement LEFT JOIN "CreditCard" card ON card."id"=movement."paymentCreditCardId" WHERE movement."userId"=$1
 UNION ALL
 SELECT ARRAY[recurrence."originFinancialAccountId",recurrence."destinationFinancialAccountId",card."financialAccountId"],'Recorrência'
 FROM "Recurrence" recurrence LEFT JOIN "CreditCard" card ON card."id"=recurrence."creditCardId" WHERE recurrence."userId"=$1
 UNION ALL
 SELECT ARRAY[card."financialAccountId",purchase."cashbackAccountId"],'Histórico de cashback' FROM "CreditPurchaseRecord" purchase
 JOIN "CreditCard" card ON card."id"=purchase."creditCardId" WHERE purchase."userId"=$1
 UNION ALL
 SELECT ARRAY[batch."financialAccountId",item."originFinancialAccountId",item."destinationFinancialAccountId",card."financialAccountId"],'Importação pendente'
 FROM "TransactionImportItem" item JOIN "TransactionImport" batch ON batch."id"=item."transactionImportId"
 LEFT JOIN "CreditCard" card ON card."id"=item."paymentCreditCardId" WHERE batch."userId"=$1 AND batch."status"='PENDING'
 UNION ALL
 SELECT ARRAY[card."financialAccountId",original."financialAccountId"],'Importação pendente'
 FROM "CreditCardImportItem" item JOIN "CreditCardImport" batch ON batch."id"=item."creditCardImportId"
 JOIN "CreditCard" card ON card."id"=batch."creditCardId"
 JOIN "CreditEntryReference" reference ON reference."id"=item."reconciledCreditPurchaseId"
 JOIN "CreditPurchaseRecord" purchase ON purchase."id"=reference."purchaseId"
 JOIN "CreditCard" original ON original."id"=purchase."creditCardId" WHERE batch."userId"=$1 AND batch."status"='PENDING'
 )
 SELECT account."id",array_agg(DISTINCT edges.reason ORDER BY edges.reason) AS reasons FROM edges
 CROSS JOIN LATERAL unnest(edges.accounts) neighbour(id)
 JOIN "FinancialAccount" account ON account."id"=neighbour.id AND account."userId"=$1
 WHERE edges.accounts && $2::varchar[] AND NOT account."id"=ANY($2::text[])
 GROUP BY account."id" ORDER BY account."id"`,
		[userId, ids],
	);
}
