import { HttpException } from "~/shared/errors";
import { db, queryFirst } from "~/shared/infra/sql";

type DirectlyOwnedTable =
	| "Category"
	| "Debt"
	| "FinancialAccount"
	| "Loan"
	| "RecurringPayment"
	| "Salary"
	| "Subscription";

export const assertDirectOwnership = async (table: DirectlyOwnedTable, id: string, userId: string) => {
	const owns = async (owner: typeof db.sql.public.Category) =>
		queryFirst(
			owner
				.select("id")
				.where((fields, functions) =>
					functions.and(functions.eq(fields.id, id), functions.eq(fields.userId, userId)),
				)
				.limit(1)
				.build(),
		);
	let resource: { id: string } | undefined;
	switch (table) {
		case "Category":
			resource = await owns(db.sql.public.Category);
			break;
		case "Debt":
			resource = await owns(db.sql.public.Debt as unknown as typeof db.sql.public.Category);
			break;
		case "FinancialAccount":
			resource = await owns(db.sql.public.FinancialAccount as unknown as typeof db.sql.public.Category);
			break;
		case "Loan":
			resource = await owns(db.sql.public.Loan as unknown as typeof db.sql.public.Category);
			break;
		case "RecurringPayment":
			resource = await owns(db.sql.public.RecurringPayment as unknown as typeof db.sql.public.Category);
			break;
		case "Salary":
			resource = await owns(db.sql.public.Salary as unknown as typeof db.sql.public.Category);
			break;
		case "Subscription":
			resource = await owns(db.sql.public.Subscription as unknown as typeof db.sql.public.Category);
	}

	if (!resource) throw new HttpException("Recurso não encontrado", 404);
};

export const assertCreditCardOwnership = async (creditCardId: string, userId: string) => {
	const card = await queryFirst(
		db.sql.public.CreditCard.innerJoin(db.sql.public.FinancialAccount, (fields, functions) =>
			functions.eq(fields.CreditCard.financialAccountId, fields.FinancialAccount.id),
		)
			.select(fields => ({ id: fields.CreditCard.id }))
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.CreditCard.id, creditCardId),
					functions.eq(fields.FinancialAccount.userId, userId),
				),
			)
			.limit(1)
			.build(),
	);

	if (!card) throw new HttpException("Cartão não encontrado", 404);
};

export const assertBalanceAccountOwnership = async (
	accountId: string,
	userId: string,
	{ allowCashback = false, allowPoints = false }: { allowCashback?: boolean; allowPoints?: boolean } = {},
) => {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id", "type")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, accountId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);

	if (!account) throw new HttpException("Conta financeira não encontrada", 404);
	if (account.type === "CREDIT_CARD")
		throw new HttpException("Cartão de crédito não possui saldo próprio", 400);
	if (account.type === "REWARDS") {
		const rewardsAccount = await queryFirst(
			db.sql.public.RewardsAccount.select("kind")
				.where((fields, functions) => functions.eq(fields.financialAccountId, accountId))
				.limit(1)
				.build(),
		);
		if (rewardsAccount?.kind === "CASHBACK" && !allowCashback)
			throw new HttpException("Conta de cashback não pode ser usada como saldo", 400);
		if (rewardsAccount?.kind === "POINTS" && !allowPoints)
			throw new HttpException("Conta de pontos não pode ser usada como saldo", 400);
	}
};

export const assertCheckingOrCashAccountOwnership = async (accountId: string, userId: string) => {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id")
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.id, accountId),
					functions.eq(fields.userId, userId),
					functions.or(
						functions.eq(fields.type, "CHECKING"),
						functions.eq(fields.type, "SAVINGS"),
						functions.eq(fields.type, "CASH"),
					),
				),
			)
			.limit(1)
			.build(),
	);

	if (!account) throw new HttpException("Selecione uma conta corrente, poupança ou Dinheiro", 400);
};

export const assertPaymentAccountOwnership = async (
	accountId: string,
	paymentMethod: "BOLETO" | "CASH" | "CREDIT" | "DEBIT" | "PIX" | "TRANSFER",
	userId: string,
) => {
	const account = await queryFirst(
		db.sql.public.FinancialAccount.select("id", "type")
			.where((fields, functions) =>
				functions.and(functions.eq(fields.id, accountId), functions.eq(fields.userId, userId)),
			)
			.limit(1)
			.build(),
	);

	if (!account) throw new HttpException("Conta financeira não encontrada", 404);
	if (paymentMethod === "CREDIT" && account.type !== "CREDIT_CARD")
		throw new HttpException("Selecione um cartão de crédito", 400);
	if (
		paymentMethod !== "CREDIT" &&
		account.type !== "CHECKING" &&
		account.type !== "SAVINGS" &&
		account.type !== "CASH"
	)
		throw new HttpException("Selecione uma conta corrente, poupança ou Dinheiro", 400);
};

export const assertTransactionOwnership = async (transactionId: string, userId: string) => {
	const origin = db.sql.public.FinancialAccount.select("id", "userId").as("origin");
	const destination = db.sql.public.FinancialAccount.select("id", "userId").as("destination");
	const transaction = await queryFirst(
		db.sql.public.Transaction.outerLeftJoin(origin, (fields, functions) =>
			functions.eq(fields.Transaction.originFinancialAccountId, fields.origin.id),
		)
			.outerLeftJoin(destination, (fields, functions) =>
				functions.eq(fields.Transaction.destinationFinancialAccountId, fields.destination.id),
			)
			.outerLeftJoin(db.sql.public.RecurringPayment, (fields, functions) =>
				functions.eq(fields.Transaction.recurrenceId, fields.RecurringPayment.id),
			)
			.outerLeftJoin(db.sql.public.Salary, (fields, functions) =>
				functions.eq(fields.Transaction.salaryId, fields.Salary.id),
			)
			.outerLeftJoin(db.sql.public.Subscription, (fields, functions) =>
				functions.eq(fields.Transaction.subscriptionId, fields.Subscription.id),
			)
			.select(fields => ({ id: fields.Transaction.id }))
			.where((fields, functions) =>
				functions.and(
					functions.eq(fields.Transaction.id, transactionId),
					functions.or(
						functions.eq(fields.origin.userId, userId),
						functions.eq(fields.destination.userId, userId),
						functions.eq(fields.RecurringPayment.userId, userId),
						functions.eq(fields.Salary.userId, userId),
						functions.eq(fields.Subscription.userId, userId),
					),
				),
			)
			.limit(1)
			.build(),
	);

	if (!transaction) throw new HttpException("Transação não encontrada", 404);
};
