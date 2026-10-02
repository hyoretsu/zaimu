import type { Transaction } from "./api";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const typeLabel: Record<Transaction["type"], string> = {
	EXPENSE: "Saída",
	INCOME: "Entrada",
	REFUND: "Reembolso",
	TRANSFER: "Transferência",
};

export function normalizeTransactionSearch(value: string) {
	return value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLocaleLowerCase("pt-BR")
		.replace(/\s+/gu, " ")
		.trim();
}

export function getTransactionSearchText(transaction: Transaction) {
	const date = transaction.date.slice(0, 10);
	const [year, month, day] = date.split("-");
	return normalizeTransactionSearch(
		[
			transaction.amount,
			currency.format(Number(transaction.amount)),
			date,
			day && month && year ? `${day}/${month}/${year}` : undefined,
			transaction.time,
			transaction.description,
			transaction.storeName,
			transaction.categoryName,
			typeLabel[transaction.type],
			transaction.isHidden ? "Oculta" : "Visível",
			transaction.originName,
			transaction.destinationName,
			transaction.sourceName,
			transaction.creditCardName,
			transaction.feeDescription,
			transaction.feeAmount,
			transaction.creditCardStatementDate?.slice(0, 7).split("-").reverse().join("/"),
			transaction.installments ? `${transaction.installments}x` : undefined,
			transaction.installmentAmount,
			...(transaction.tags?.map(tag => tag.name) ?? []),
			...(transaction.debtSplit ? ["Dívida"] : []),
			...(transaction.debtSplit?.participants.flatMap(participant => [
				participant.debtPersonName,
				participant.description,
			]) ?? []),
		]
			.filter(value => value !== null && value !== undefined)
			.join(" "),
	);
}
