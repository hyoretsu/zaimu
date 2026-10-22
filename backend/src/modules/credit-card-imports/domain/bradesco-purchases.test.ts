import { expect, test } from "bun:test";
import { parseBradescoPurchases } from "./bradesco-purchases";

const purchases = "11/01 AMAZON MARKETPLACE CC SAO PAULO(02/02) 11,63";

test("Amazon February keeps closing and due dates separate and preserves the second installment", () => {
	const statement = parseBradescoPurchases(
		`Vencimento 25/02/2026
 A previsão de fechamento da sua próxima fatura é dia 11/03/2026`,
		purchases,
	);
	expect(statement.statementDate).toBeUndefined();
	expect(statement.dueDate).toBe("2026-02-25");
	expect(statement.purchases[0]).toMatchObject({
		currentInstallment: 2,
		installmentAmount: 11.63,
		installments: 2,
	});
});

test("explicit closing dates override forecasts", () => {
	expect(
		parseBradescoPurchases(
			`Vencimento 25/02/2026
 Data de fechamento 12/02/2026
 Fechamento da sua próxima fatura é dia 11/03/2026`,
			purchases,
		).statementDate,
	).toBe("2026-02-12");
});

test("closing alone never becomes the due date", () => {
	const statement = parseBradescoPurchases("Data de fechamento 12/02/2026", purchases);
	expect(statement.statementDate).toBe("2026-02-12");
	expect(statement.dueDate).toBeUndefined();
});
