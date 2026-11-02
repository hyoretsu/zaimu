import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

const dateKey = (year: string, month: string, day: string) => `${year}-${month}-${day}`;

/** Global statements use US-style amounts ("$8.48"); a leading/trailing minus marks a credit. */
function usdAmount(value: string) {
	const magnitude = Number(value.replace(/[^\d.]/gu, ""));
	return value.includes("-") ? -magnitude : magnitude;
}

export function isInterGlobalStatementText(text: string) {
	return /Valor\s*\(USD\)/iu.test(text) && /Fatura\s+Global|Cartão\s+Global/iu.test(text);
}

export function parseInterGlobalCreditCardStatementText(text: string): CreditCardStatement {
	const dueMatch = text.match(/Data\s+de\s+vencimento\s+(\d{2})\/(\d{2})\/(\d{4})/iu);
	// Billing period is printed month-first (MM/DD/YYYY); its end is the statement closing.
	const periodMatch = text.match(
		/Período\s+de\s+cobrança:\s*\d{2}\/\d{2}\/\d{4}\s+(\d{2})\/(\d{2})\/(\d{4})/iu,
	);
	const start = text.search(/Despesas\s+da\s+fatura/iu);
	if (start < 0) throw new Error("Não foi possível encontrar as despesas da fatura");
	const end = text.search(/Totais\s+de\s+\d{4}\s+até/iu);
	const lines = text
		.slice(start, end < 0 ? undefined : end)
		.split("\n")
		.map(line => line.trim());

	const purchases: CreditCardStatementPurchase[] = [];
	let section: "charge" | "credit" | undefined;
	let pending: { date: string; description: string[] } | undefined;
	const startPattern = /^(\d{2})\/(\d{2})\/(\d{4})\s+(\d{2})\/(\d{2})\/(\d{4})\s+(.*)$/u;
	const amountPattern = /^(.*?)\s*([+−-]?\s*\$\s*[+−-]?\s*[\d,]+\.\d{2})$/u;

	const finish = (body: string) => {
		if (!pending || !section) return;
		const amountMatch = body.match(amountPattern);
		if (!amountMatch) {
			pending.description.push(body);
			return;
		}
		if (amountMatch[1]) pending.description.push(amountMatch[1]);
		const amount = Math.abs(usdAmount(amountMatch[2]!)) * (section === "credit" ? -1 : 1);
		const description = pending.description.join(" ").replace(/\s+/gu, " ").trim();
		if (description && !/^pagamento\b/iu.test(description) && amount !== 0)
			purchases.push({
				currentInstallment: 1,
				description,
				installmentAmount: amount,
				installments: 1,
				purchaseDate: pending.date,
				totalAmount: amount,
			});
		pending = undefined;
	};

	for (const line of lines) {
		if (/^Pagamentos,\s+créditos\s+e\s+estornos/iu.test(line)) section = "credit";
		else if (/^Compras$/iu.test(line)) section = "charge";
		else if (/^(?:Taxas|Juros\s+Cobrados)$/iu.test(line)) section = undefined;
		else if (!section || !line || /^Nenhuma\s+transação/iu.test(line)) continue;
		else {
			const startMatch = line.match(startPattern);
			if (startMatch) {
				// Second date is the transaction date, also month-first.
				pending = { date: dateKey(startMatch[6]!, startMatch[4]!, startMatch[5]!), description: [] };
				finish(startMatch[7]!);
			} else if (pending) finish(line);
		}
	}

	return {
		dueDate: dueMatch ? dateKey(dueMatch[3]!, dueMatch[2]!, dueMatch[1]!) : undefined,
		provider: "INTER",
		purchases,
		statementDate: periodMatch ? dateKey(periodMatch[3]!, periodMatch[1]!, periodMatch[2]!) : undefined,
	};
}
