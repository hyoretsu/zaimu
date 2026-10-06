import { materializeBookInstallments } from "@zaimu/finance/credit-book";
import { HttpException } from "~/shared/errors";
import { db, param, queryFirst, queryRaw } from "~/shared/infra/sql";
import { loadCreditCardScheduleCandidates } from "./credit-card-schedule-candidates";
import { mutateCreditBook } from "./normalized-credit-book";

export { getStatementDates } from "./credit-card-schedule-periods";

const statementColumns = [
	"id",
	"creditCardId",
	"statementDate",
	"dueDate",
	"totalAmount",
	"paidAmount",
	"isPaid",
	"isFullySynced",
	"createdAt",
	"updatedAt",
] as const;

export async function getOrCreateStatement(creditCardId: string, dueDate: Date, statementDate: Date) {
	await queryFirst(
		db.raw.sql`
			INSERT INTO "CreditCardStatement" ("creditCardId", "dueDate", "statementDate", "totalAmount")
			VALUES (
				${param(creditCardId, { codecId: "sql/varchar@1" })},
				${param(dueDate, { codecId: "pg/date@1" })},
				${param(statementDate, { codecId: "pg/date@1" })},
				0
			)
			ON CONFLICT ("creditCardId", "statementDate") DO NOTHING
			RETURNING "id"
		`
			.returnsRow({ id: db.sql.public.CreditCardStatement.columns.id })
			.build(),
	);
	const statement = await queryFirst(
		db.sql.public.CreditCardStatement.select(...statementColumns)
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.creditCardId, creditCardId),
					functions.eq(fields.statementDate, statementDate),
				),
			)
			.limit(1)
			.build(),
	);
	if (!statement) throw new HttpException("Statement not created", 500);
	return statement;
}

export async function materializeCreditCardSchedules(asOf = new Date(), cardIds?: string[]) {
	const cards = await loadCreditCardScheduleCandidates(asOf, cardIds);
	const changedCards = new Set<string>();
	const missing = cards.flatMap(card =>
		card.missingStatements.map(statement => ({ ...statement, creditCardId: card.id })),
	);
	if (missing.length) {
		const inserted = await queryRaw<{ creditCardId: string }>(
			`INSERT INTO "CreditCardStatement" ("creditCardId","dueDate","statementDate","totalAmount") SELECT entry."creditCardId",entry."dueDate"::date,entry."statementDate"::date,0 FROM jsonb_to_recordset($1::jsonb) entry("creditCardId" varchar,"dueDate" text,"statementDate" text) ON CONFLICT ("creditCardId","statementDate") DO NOTHING RETURNING "creditCardId"`,
			[JSON.stringify(missing)],
		);
		for (const row of inserted) changedCards.add(row.creditCardId);
	}
	for (const card of cards) {
		if (!card.dueInstallments) continue;
		const changed = await mutateCreditBook(
			card.userId,
			card.id,
			book => {
				const before = book.installments.length;
				materializeBookInstallments(book, asOf.toISOString().slice(0, 10));
				return book.installments.length !== before;
			},
			asOf.toISOString().slice(0, 10),
		);
		if (changed) changedCards.add(card.id);
	}
	return {
		cards: cards.length,
		userIds: [...new Set(cards.filter(card => changedCards.has(card.id)).map(card => card.userId))],
	};
}
