import { replayCreditBook } from "@zaimu/finance/credit-book";
import { getFinancialAccountBalances } from "~/modules/accounts/application/get-financial-account-balances";
import { loadCreditBook } from "~/modules/creditCards/application/normalized-credit-book";
import { userFinancialDate } from "~/shared/application/financial-date";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";
import { availableTransferName, recurrenceMoves, transferVersion } from "../domain/transfer-policy";

// Same ownership graph powers preview fingerprints and database write guards.
export const transferTables = [
	"TransactionTransferSuggestionRejection",
	"TransactionImportTransferSuggestionRejection",
	"FinancialAccount",
	"CreditCard",
	"RewardsAccount",
	"Transaction",
	"TransactionHistory",
	"TransactionExternalReference",
	"BalanceAdjustment",
	"FinancialAccountYield",
	"FinancialAccountYieldRateHistory",
	"DetachedRewardCredit",
	"CreditCardStatement",
	"CreditCardHistory",
	"CreditPurchaseRecord",
	"CreditInstallmentPlan",
	"CreditInstallmentRecord",
	"CreditRefundRecord",
	"CreditStatementCharge",
	"CreditRefundReview",
	"CreditEntryReference",
	"CreditPurchaseHistory",
	"CreditPurchaseImportIdentity",
	"CreditBookTombstone",
	"Recurrence",
	"RecurrenceHistory",
	"RecurrenceOccurrence",
	"TransactionImport",
	"TransactionImportItem",
	"CreditCardImport",
	"CreditCardImportItem",
	"DebtSplit",
	"DebtSplitParticipant",
	"DebtTransactionLink",
	"DebtPurchaseLink",
	"LoanPayment",
	"UserFinancialInstitution",
	"UserInstitutionProfileChange",
	"Category",
	"TagAssignment",
	"OpenFinanceBinding",
	"OpenFinanceRecord",
	"OpenFinanceIdentity",
	"DetachedFinancialRecord",
] as const;
export type TransferRow = Record<string, unknown> & { id?: string };
export type Snapshot = Record<string, TransferRow[]>;

export async function loadTransferSnapshot(senderId: string, recipientId: string) {
	const snapshot: Snapshot = {};
	for (const table of transferTables) {
		snapshot[table] = await queryRaw(
			`SELECT to_jsonb(row) AS data FROM "${table}" row WHERE zaimu_record_owner($1,to_jsonb(row))=ANY($2::text[]) ORDER BY to_jsonb(row)::text`,
			[table, [senderId, recipientId]],
		).then(rows => rows.map(row => row.data as TransferRow));
	}
	snapshot.institutionPolicies = await queryRaw(
		`SELECT to_jsonb(row) AS data FROM "FinancialInstitutionYieldPolicy" row ORDER BY "id" FOR SHARE`,
	).then(rows => rows.map(row => row.data as TransferRow));
	snapshot.institutionRules = await queryRaw(
		`SELECT to_jsonb(row) AS data FROM "FinancialInstitutionProfile" row ORDER BY "id" FOR SHARE`,
	).then(rows => rows.map(row => row.data as TransferRow));
	snapshot.institutions = await queryRaw(
		`SELECT to_jsonb(row) AS data FROM "FinancialInstitution" row WHERE "id"=ANY($1::text[]) ORDER BY "id" FOR SHARE`,
		[
			snapshot.FinancialAccount.flatMap(account =>
				account.institutionId ? [String(account.institutionId)] : [],
			),
		],
	).then(rows => rows.map(row => row.data as TransferRow));
	return snapshot;
}

export async function describeTransfer(
	senderId: string,
	recipientId: string,
	accountIds: string[],
	snapshot: Snapshot,
) {
	const accounts = snapshot.FinancialAccount.filter(
		row => accountIds.includes(String(row.id)) && row.userId === senderId,
	);
	if (accounts.length !== accountIds.length)
		throw new HttpException(
			"Uma conta do convite foi removida ou mudou de titular. Cancele o convite e crie outro.",
			409,
		);
	const selected = new Set(accountIds);
	const cards = snapshot.CreditCard.filter(row => selected.has(String(row.financialAccountId)));
	const cardIds = new Set(cards.map(row => String(row.id)));
	const recurrences = snapshot.Recurrence.filter(
		row =>
			row.userId === senderId &&
			(selected.has(String(row.originFinancialAccountId)) ||
				selected.has(String(row.destinationFinancialAccountId)) ||
				cardIds.has(String(row.creditCardId))),
	);
	const moves = (row: TransferRow) =>
		recurrenceMoves(
			[
				row.originFinancialAccountId as string | null,
				row.destinationFinancialAccountId as string | null,
				row.creditCardId
					? (snapshot.CreditCard.find(card => card.id === row.creditCardId)
							?.financialAccountId as string)
					: null,
			],
			selected,
		);
	const balances = await getFinancialAccountBalances(accountIds);
	const institutions = await queryRaw<{ id: string; name: string }>(
		`SELECT "id","name" FROM "FinancialInstitution" WHERE "id"=ANY($1::text[])`,
		[accounts.map(a => a.institutionId).filter(Boolean)],
	);
	const names = new Map<string, Set<string>>();
	for (const account of snapshot.FinancialAccount.filter(row => row.userId === recipientId)) {
		const key = `${account.institutionId}:${account.type}`;
		const used = names.get(key) ?? new Set<string>();
		used.add(String(account.name ?? ""));
		names.set(key, used);
	}
	const asOf = await userFinancialDate(senderId);
	const presented = await Promise.all(
		accounts.map(async account => {
			const key = `${account.institutionId}:${account.type}`;
			const used = names.get(key) ?? new Set<string>();
			names.set(key, used);
			const destinationName = availableTransferName(account.name as string | null, used);
			const card = cards.find(card => card.financialAccountId === account.id);
			const statements = card
				? replayCreditBook(
						await loadCreditBook(queryRaw, senderId, String(card.id), false, false),
						asOf,
					)
						.statements.filter(statement => !statement.isForecast)
						.map(statement => ({
							amountDue: statement.amountDue,
							currency: String(card.currency),
							dueDate: statement.dueDate,
							id: statement.id,
							totalAmount: statement.totalAmount,
						}))
				: [];
			return {
				balance: balances.get(String(account.id)) ?? 0,
				currency: String(account.currency),
				destinationName,
				id: String(account.id),
				institutionName: institutions.find(i => i.id === account.institutionId)?.name ?? null,
				isHidden: Boolean(account.isHidden),
				name: account.name as string | null,
				rewardsKind: (snapshot.RewardsAccount.find(row => row.financialAccountId === account.id)
					?.kind ?? null) as "POINTS" | "CASHBACK" | null,
				statements,
				type: String(account.type),
			};
		}),
	);
	const transactions = snapshot.Transaction.filter(
		row =>
			row.userId === senderId &&
			(selected.has(String(row.originFinancialAccountId)) ||
				selected.has(String(row.destinationFinancialAccountId)) ||
				cardIds.has(String(row.paymentCreditCardId))),
	);
	const separated = transactions.filter(row =>
		[
			row.originFinancialAccountId,
			row.destinationFinancialAccountId,
			row.paymentCreditCardId
				? snapshot.CreditCard.find(card => card.id === row.paymentCreditCardId)?.financialAccountId
				: null,
		]
			.filter(Boolean)
			.some(id => !selected.has(String(id))),
	);
	const counts = {
		imports:
			snapshot.TransactionImport.filter(row => selected.has(String(row.financialAccountId))).length +
			snapshot.CreditCardImport.filter(row => cardIds.has(String(row.creditCardId))).length,
		pausedRecurrences: recurrences.filter(row => !moves(row)).length,
		purchases: snapshot.CreditPurchaseRecord.filter(row => cardIds.has(String(row.creditCardId))).length,
		recurrences: recurrences.filter(moves).length,
		separatedMovements:
			separated.length +
			snapshot.CreditPurchaseRecord.filter(
				row =>
					row.cashbackAccountId &&
					selected.has(String(row.cashbackAccountId)) !== cardIds.has(String(row.creditCardId)),
			).length +
			snapshot.LoanPayment.filter(row => selected.has(String(row.financialAccountId))).length,
		statements: snapshot.CreditCardStatement.filter(row => cardIds.has(String(row.creditCardId))).length,
		transactions: transactions.length,
	};
	return {
		accounts: presented,
		counts,
		version: transferVersion({ accountIds, accounts: presented, asOf, snapshot }),
		warnings: [
			"Dívidas e empréstimos permanecem com o remetente.",
			"Movimentos separados passam a ser independentes e preservados como histórico.",
			"Conexões Open Finance não são transferidas. Configure sua própria integração.",
			"Contas criadas depois do envio não fazem parte deste convite.",
		],
	};
}
