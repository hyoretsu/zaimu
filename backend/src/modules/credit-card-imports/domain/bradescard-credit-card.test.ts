import { describe, expect, test } from "bun:test";
import { parseBradescardCreditCardStatementText } from "./bradescard-credit-card";

const header = `Fatura Mensal
Movimentações da conta
Data Descrição Valor R$
Nacionais em Reais (R$)
CLIENTE 5373.63**.****.1234`;
const footer = `Resumo dos encargos financeiros
Vencimento Total da fatura Parcelamento fatura Pagamento
1ª parcela R$ 5,70 mínimo
25/04/2025 R$ 29,65 +06 X R$ 5,70
Previsão para fechamento da próxima fatura é dia 10/05/2025
Data de Vencimento
25/04/2025`;

describe("Bradescard legacy layout", () => {
	test("reads the Amazon April layout without importing financing offers", () => {
		const statement = parseBradescardCreditCardStatementText(`${header}
05/04 Amazon Digital BR SAO PAULO BRA 26,50
05/04 AMAZON BR SAO PAULO BRA 3,15
${footer}
Parcelamento de Fatura
01/04 FINANCING OFFER 39,90`);
		expect(statement.dueDate).toBe("2025-04-25");
		expect(statement.statementDate).toBeUndefined();
		expect(statement.provider).toBe("BRADESCO");
		expect(statement.purchases).toHaveLength(2);
		expect(statement.purchases.map(purchase => purchase.installmentAmount)).toEqual([26.5, 3.15]);
		expect(statement.purchases[0]!.purchaseDate).toBe("2025-04-05");
	});

	test("shares installment, refund and payment handling with other Bradesco layouts", () => {
		const statement = parseBradescardCreditCardStatementText(`${header}
05/12 STORE (04/06) 10,00
05/04 STORE REFUND 15,00 -
06/04 PAGAMENTO RECEBIDO - OBRIGADO 29,65 -
${footer}`);
		expect(statement.purchases).toHaveLength(2);
		expect(statement.purchases[0]).toMatchObject({
			currentInstallment: 4,
			installments: 6,
			purchaseDate: "2024-12-05",
			totalAmount: 60,
		});
		expect(statement.purchases[1]!.installmentAmount).toBe(-15);
	});

	test("rejects absent periods and transaction sections", () => {
		expect(() => parseBradescardCreditCardStatementText(header)).toThrow("período");
		expect(() => parseBradescardCreditCardStatementText(footer)).toThrow("lançamentos");
	});
});
