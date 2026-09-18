import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

const moneyToNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const money = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

function parseFinancedOperations(text: string, statementDate: Date): CreditCardStatementPurchase[] {
	const purchases: CreditCardStatementPurchase[] = [];
	for (const section of text.matchAll(
		/Operações\s+de\s+crédito\s+contratad[oa]s?\s+Data\s+Operação\s+Valor\s+\(R\$\)\s*([\s\S]*?)(?=Transações\s+Nacionais|Subtotal\s+dos\s+lançamentos|Página\s+\d|$)/giu,
	))
		purchases.push(...parseFinancedOperationSection(section[1]!, statementDate));
	return purchases;
}

function parseFinancedOperationSection(section: string, statementDate: Date): CreditCardStatementPurchase[] {
	const purchases: CreditCardStatementPurchase[] = [];
	let lastFinanced: {
		baseCents: number;
		date: string;
		feeCents: number;
		purchase: CreditCardStatementPurchase;
	} | null = null;
	for (const match of section.matchAll(/^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/gimu)) {
		const description = match[3]!.trim();
		const amount = moneyToNumber(match[4]!);
		if (!Number.isFinite(amount)) continue;
		const date = `${match[1]}/${match[2]}`;
		if (/^IOF\s+(?:DIARIO|DIÁRIO|ADICIONAL)\s+PARCELADO$/iu.test(description)) {
			// PicPay prints the two IOF lines directly below their financed installment.
			if (lastFinanced?.date !== date)
				throw new Error("IOF do parcelamento sem operação de crédito correspondente");
			lastFinanced.feeCents += Math.round(amount * 100);
			const purchase = lastFinanced.purchase;
			purchase.installmentAmount = (lastFinanced.baseCents + lastFinanced.feeCents) / 100;
			purchase.totalAmount = Math.round(purchase.installmentAmount * purchase.installments * 100) / 100;
			purchase.description = `${purchase.description.split(" · IOF R$ ")[0]} · IOF R$ ${money.format(lastFinanced.feeCents / 100)}`;
			continue;
		}
		lastFinanced = null;
		const installment = description.match(
			/^FIN\s+(.+?)\s+PARC(?:ELA)?\s*0?(\d{1,2})\s*(?:\/|DE)\s*0?(\d{1,2})$/iu,
		);
		if (!installment || amount <= 0) continue;
		const currentInstallment = Number(installment[2]);
		const installments = Number(installment[3]);
		if (currentInstallment < 1 || installments < currentInstallment || installments > 48) continue;
		const purchase = {
			currentInstallment,
			description: `FIN ${installment[1]!.trim()} · IOF R$ 0,00`,
			installmentAmount: amount,
			installments,
			purchaseDate: inferPurchaseDate(Number(match[1]), Number(match[2]), statementDate, currentInstallment),
			totalAmount: Math.round(amount * installments * 100) / 100,
		};
		purchases.push(purchase);
		lastFinanced = { baseCents: Math.round(amount * 100), date, feeCents: 0, purchase };
	}
	return purchases;
}

function parseFullDate(value: string) {
	const [day, month, year] = value.split("/").map(Number);
	if (!day || !month || !year) throw new Error("Data inválida");
	return new Date(year, month - 1, day);
}

function inferPurchaseDate(day: number, month: number, statementDate: Date, currentInstallment: number) {
	const statementMonth = statementDate.getFullYear() * 12 + statementDate.getMonth();
	const candidates = [0, 1, 2, 3, 4].map(yearsAgo => {
		const year = statementDate.getFullYear() - yearsAgo;
		const date = new Date(year, month - 1, day);
		const monthDistance = statementMonth - (year * 12 + month - 1);
		return { date, score: Math.abs(monthDistance - currentInstallment + 1) * 10 + Math.abs(monthDistance) };
	});
	const selected = candidates
		.filter(candidate => candidate.date <= statementDate)
		.toSorted((a, b) => a.score - b.score)[0];
	if (!selected) throw new Error("Data da compra inválida");
	return dateKey(selected.date);
}

function parseInvoiceDates(text: string) {
	const compactHeader = text.match(
		/(\d{2}\/\d{2}\/\d{4})\s*\|\s*(\d{2}\/\d{2}\/\d{4})\s+Vencimento:\s*Fechamento:/iu,
	);
	if (compactHeader)
		return { dueDate: parseFullDate(compactHeader[1]!), statementDate: parseFullDate(compactHeader[2]!) };
	const dueDate = text.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/iu);
	const statementDate = text.match(/Fechamento(?:\s+da\s+fatura)?:\s*(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDate || !statementDate)
		throw new Error("Não foi possível identificar vencimento e fechamento da fatura");
	return { dueDate: parseFullDate(dueDate[1]!), statementDate: parseFullDate(statementDate[1]!) };
}

export function parsePicPayCreditCardStatementText(text: string): CreditCardStatement {
	const { dueDate, statementDate } = parseInvoiceDates(text);
	const sectionPattern =
		/Transações\s+Nacionais\s+Data\s+Estabelecimento\s+Valor\s+\(R\$\)\s*([\s\S]*?)(?=Subtotal\s+dos\s+lançamentos|Total\s+geral\s+dos\s+lançamentos)/giu;
	const purchasePattern = /^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/gimu;
	const purchases: CreditCardStatementPurchase[] = parseFinancedOperations(text, statementDate);
	for (const section of text.matchAll(sectionPattern)) {
		for (const match of section[1]!.matchAll(purchasePattern)) {
			const installmentAmount = moneyToNumber(match[4]!);
			if (match[4]!.startsWith("-") || !Number.isFinite(installmentAmount)) continue;
			const description = match[3]!.trim();
			const installment = description.match(/PARC(?:ELA)?\s*0?(\d{1,2})\s*(?:\/|DE)\s*0?(\d{1,2})/iu);
			const currentInstallment = Number(installment?.[1] ?? 1);
			const installments = Number(installment?.[2] ?? 1);
			if (currentInstallment < 1 || installments < currentInstallment || installments > 48) continue;
			purchases.push({
				currentInstallment,
				description: description.replace(/\s*PARC(?:ELA)?\s*0?\d{1,2}\s*(?:\/|DE)\s*0?\d{1,2}\s*$/iu, ""),
				installmentAmount,
				installments,
				purchaseDate: inferPurchaseDate(
					Number(match[1]),
					Number(match[2]),
					statementDate,
					currentInstallment,
				),
				totalAmount: Math.round(installmentAmount * installments * 100) / 100,
			});
		}
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return { dueDate: dateKey(dueDate), provider: "PICPAY", purchases, statementDate: dateKey(statementDate) };
}
