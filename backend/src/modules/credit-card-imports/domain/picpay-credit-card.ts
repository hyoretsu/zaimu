import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";

const moneyToNumber = (value: string) => Number(value.replace(/\./g, "").replace(",", "."));
const dateKey = (date: Date) => date.toISOString().slice(0, 10);
const money = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 2, minimumFractionDigits: 2 });

const normalizeMerchant = (value: string) =>
	value
		.normalize("NFD")
		.replace(/[\u0300-\u036f]/gu, "")
		.replace(/[^a-z\d]/giu, "")
		.toLowerCase();

function linkFinancedSources(purchases: CreditCardStatementPurchase[], credits: number[]) {
	const originalIndexes = purchases.flatMap((purchase, index) =>
		!purchase.description.startsWith("FIN ") && purchase.installments === 1 ? [index] : [],
	);
	const creditedIndexes: number[] = [];
	for (const amount of credits) {
		const matches = originalIndexes.filter(
			index =>
				!creditedIndexes.includes(index) && Math.round(purchases[index]!.installmentAmount * 100) === amount,
		);
		if (matches.length !== 1) throw new Error("Crédito do parcelamento sem compra original inequívoca");
		creditedIndexes.push(matches[0]!);
	}
	const available = [...creditedIndexes];
	for (const purchase of purchases) {
		if (!purchase.description.startsWith("FIN ") || !available.length) continue;
		const merchant = normalizeMerchant(purchase.description.split(" · IOF R$ ")[0]!.replace(/^FIN /u, ""));
		const matched = available.find(index => {
			const original = normalizeMerchant(purchases[index]!.description);
			return merchant.length >= 3 && (original.startsWith(merchant) || merchant.startsWith(original));
		});
		if (matched === undefined) continue;
		purchase.financingSourceIndex = matched;
		available.splice(available.indexOf(matched), 1);
	}
	if (available.length) throw new Error("Crédito do parcelamento sem parcela financiada correspondente");
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
		/(\d{2}[/-]\d{2}[/-]\d{4})\s*\|\s*(\d{2}[/-]\d{2}[/-]\d{4})\s+Vencimento:\s*Fechamento:/iu,
	);
	if (compactHeader)
		return {
			dueDate: parseFullDate(compactHeader[1]!.replaceAll("-", "/")),
			statementDate: parseFullDate(compactHeader[2]!.replaceAll("-", "/")),
		};
	const dueDate = text.match(/Vencimento:\s*(\d{2}\/\d{2}\/\d{4})/iu);
	const statementDate = text.match(/Fechamento(?:\s+da\s+fatura)?:\s*(\d{2}\/\d{2}\/\d{4})/iu);
	if (!dueDate || !statementDate)
		throw new Error("Não foi possível identificar vencimento e fechamento da fatura");
	return { dueDate: parseFullDate(dueDate[1]!), statementDate: parseFullDate(statementDate[1]!) };
}

export function parsePicPayCreditCardStatementText(text: string): CreditCardStatement {
	const { dueDate, statementDate } = parseInvoiceDates(text);
	const start = text.search(/Picpay Card\s+(?:Transações\s+Nacionais|Operações\s+de\s+crédito)/iu);
	const end = text.indexOf("Total geral dos lançamentos", start);
	const entries = start >= 0 ? text.slice(start, end > start ? end : undefined) : text;
	const purchases: CreditCardStatementPurchase[] = [];
	const credits: number[] = [];
	let lastFinanced: {
		baseCents: number;
		date: string;
		feeCents: number;
		purchase: CreditCardStatementPurchase;
	} | null = null;
	for (const match of entries.matchAll(/^(\d{2})\/(\d{2})\s+(.+?)\s+(-?[\d.]+,\d{2})$/gimu)) {
		const amount = moneyToNumber(match[4]!);
		if (!Number.isFinite(amount)) continue;
		const description = match[3]!.trim();
		const date = `${match[1]}/${match[2]}`;
		if (/^IOF\s+(?:DIARIO|DIÁRIO|ADICIONAL)\s+PARCELADO$/iu.test(description)) {
			if (lastFinanced?.date !== date) throw new Error("IOF do parcelamento sem operação correspondente");
			lastFinanced.feeCents += Math.round(amount * 100);
			const purchase = lastFinanced.purchase;
			purchase.installmentAmount = (lastFinanced.baseCents + lastFinanced.feeCents) / 100;
			purchase.totalAmount = Math.round(purchase.installmentAmount * purchase.installments * 100) / 100;
			purchase.description = `${purchase.description.split(" · IOF R$ ")[0]} · IOF R$ ${money.format(lastFinanced.feeCents / 100)}`;
			continue;
		}
		lastFinanced = null;
		if (/^CREDITO PARCELAMENTO COMPRA$/iu.test(description) && amount < 0) {
			credits.push(Math.round(-amount * 100));
			continue;
		}
		if (amount < 0 && /PAGAMENTO\s+(?:DE\s+)?FATURA/iu.test(description)) continue;
		if (amount === 0) continue;
		if (amount < 0) {
			purchases.push({
				currentInstallment: 1,
				description: `Reembolso — ${description}`,
				installmentAmount: amount,
				installments: 1,
				purchaseDate: inferPurchaseDate(Number(match[1]), Number(match[2]), statementDate, 1),
				totalAmount: amount,
			});
			continue;
		}
		const financed = description.match(
			/^FIN\s+(.+?)\s*PARC(?:ELA)?\s*0?(\d{1,2})\s*(?:\/|DE)\s*0?(\d{1,2})$/iu,
		);
		const installment = description.match(/PARC(?:ELA)?\s*0?(\d{1,2})\s*(?:\/|DE)\s*0?(\d{1,2})/iu);
		const currentInstallment = Number(installment?.[1] ?? 1);
		const installments = Number(installment?.[2] ?? 1);
		if (currentInstallment < 1 || installments < currentInstallment || installments > 48) continue;
		const purchase: CreditCardStatementPurchase = {
			currentInstallment,
			description: financed
				? `FIN ${financed[1]!.trim()} · IOF R$ 0,00`
				: description.replace(/\s*PARC(?:ELA)?\s*0?\d{1,2}\s*(?:\/|DE)\s*0?\d{1,2}\s*$/iu, ""),
			installmentAmount: amount,
			installments,
			purchaseDate: inferPurchaseDate(Number(match[1]), Number(match[2]), statementDate, currentInstallment),
			totalAmount: Math.round(amount * installments * 100) / 100,
		};
		purchases.push(purchase);
		if (financed) lastFinanced = { baseCents: Math.round(amount * 100), date, feeCents: 0, purchase };
	}
	// International entries in this PicPay layout split the merchant and BRL amount over multiple lines.
	const internationalCredit = entries.match(
		/\d{2}\/\d{2}\s+CREDITO PARCELAMEN RA\s+Câmbio do dia:[^\n]*\n-?[\d.]+,\d{2}\s+(-[\d.]+,\d{2})/iu,
	);
	if (internationalCredit) credits.push(Math.round(-moneyToNumber(internationalCredit[1]!) * 100));
	const internationalPurchase = entries.match(
		/(\d{2})\/(\d{2})\s*\n\s*(GTFCHARGE)\s*\n(?:[^\n]*\n){1,3}[\d.]+,\d{2}\s+([\d.]+,\d{2})/iu,
	);
	if (internationalPurchase) {
		const amount = moneyToNumber(internationalPurchase[4]!);
		purchases.push({
			currentInstallment: 1,
			description: internationalPurchase[3]!,
			installmentAmount: amount,
			installments: 1,
			purchaseDate: inferPurchaseDate(
				Number(internationalPurchase[1]),
				Number(internationalPurchase[2]),
				statementDate,
				1,
			),
			totalAmount: amount,
		});
	}
	if (credits.length) linkFinancedSources(purchases, credits);
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return { dueDate: dateKey(dueDate), provider: "PICPAY", purchases, statementDate: dateKey(statementDate) };
}
