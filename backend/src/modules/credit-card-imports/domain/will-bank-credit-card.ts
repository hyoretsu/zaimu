import { groupAnticipatedInstallments } from "./anticipated-installments";
import type { CreditCardStatement, CreditCardStatementPurchase } from "./credit-card-statement";
import { statementMoney } from "./statement-money";

function fullDate(value: string) {
	const [day, month, year] = value.split("/");
	const key = `${year}-${month}-${day}`;
	const date = new Date(`${key}T12:00:00Z`);
	if (!Number.isFinite(date.getTime()) || date.toISOString().slice(0, 10) !== key)
		throw new Error("Data inválida na fatura");
	return key;
}

function legacyDate(value: string, reference: string, installment: number) {
	const [day, month] = value.split("/").map(Number);
	const ref = new Date(`${reference}T12:00:00Z`);
	const candidates = Array.from({ length: 5 }, (_, ago) => {
		const year = ref.getUTCFullYear() - ago;
		const key = fullDate(`${String(day).padStart(2, "0")}/${String(month).padStart(2, "0")}/${year}`);
		const distance = (ref.getUTCFullYear() - year) * 12 + ref.getUTCMonth() - month! + 1;
		return { key, score: Math.min(Math.abs(distance - installment), Math.abs(distance - installment + 1)) };
	});
	const selected = candidates.filter(c => c.key <= reference).toSorted((a, b) => a.score - b.score)[0];
	if (!selected) throw new Error("Data da compra inválida");
	return selected.key;
}

export function parseWillBankCreditCardStatementText(text: string): CreditCardStatement {
	const due = text.match(
		/(?:Vencimento(?:\s+em)?|Data de vencimento da fatura)\s*:?\s*(\d{2}\/\d{2}\/\d{4})/iu,
	)?.[1];
	const closing = text.match(/Fechamento da fatura\s*:?\s*(\d{2}\/\d{2}\/\d{4})/iu)?.[1];
	if (!due && !closing) throw new Error("Não foi possível identificar vencimento da fatura");
	const dueDate = due ? fullDate(due) : undefined;
	const statementDate = closing ? fullDate(closing) : undefined;
	const purchases: CreditCardStatementPurchase[] = [];
	let received = false;
	for (const line of text.split("\n")) {
		if (/^\s*(?:Valores recebidos|Recebidos)\b/iu.test(line)) received = true;
		if (/^\s*(?:Parcelamentos|Gastos|Compras)\b/iu.test(line)) received = false;
		const legacy = line.match(
			/^\s*(\d{2}\/\d{2})\s+(.+?)\s+(?:Virtual|Standard)\s+([−+-]?\s*R\$\s*[−+-]?\s*[\d.]+,\d{2}\s*[−-]?)\s*$/iu,
		);
		const current = line.match(
			/^\s*(.+?)\s+(\d{2}\/\d{2}\/\d{4})\s+Cartão\s+\d{4}\s+([−+-]?\s*R\$\s*[−+-]?\s*[\d.]+,\d{2}\s*[−-]?)\s*$/iu,
		);
		if (!legacy && !current) continue;
		let description = (legacy?.[2] ?? current?.[1])!.trim();
		if (/^(?:PAG FATURA|PAGAMENTO (?:DE |DA )?FATURA)/iu.test(description)) continue;
		const plan = description.match(/\s+(?:Parcela\s+)?(\d{1,2})\s*(?:\/|de)\s*(\d{1,2})$/iu);
		const currentInstallment = Number(plan?.[1] ?? 1);
		const installments = Number(plan?.[2] ?? 1);
		if (currentInstallment < 1 || installments < currentInstallment || installments > 48)
			throw new Error("Parcelamento inválido na fatura");
		description = description.replace(/\s+(?:Parcela\s+)?\d{1,2}\s*(?:\/|de)\s*\d{1,2}$/iu, "");
		const amount = statementMoney((legacy?.[3] ?? current?.[3])!);
		const installmentAmount = received ? -Math.abs(amount) : amount;
		const token = (legacy?.[1] ?? current?.[2])!;
		purchases.push({
			currentInstallment,
			description,
			installmentAmount,
			installments,
			purchaseDate: legacy
				? legacyDate(token, (statementDate ?? dueDate)!, currentInstallment)
				: fullDate(token),
			statementPurchaseDate: token,
			totalAmount: Math.round(installmentAmount * installments * 100) / 100,
		});
	}
	if (!purchases.length) throw new Error("Nenhuma compra foi encontrada na fatura");
	return {
		dueDate,
		provider: "WILL_BANK",
		purchases: groupAnticipatedInstallments(purchases),
		statementDate,
	};
}
