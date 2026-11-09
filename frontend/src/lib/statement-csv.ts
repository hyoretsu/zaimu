import type { Transaction } from "./api";
import { getTransactionTitle } from "./transaction-title";

const header = ["Data", "Descrição", "Tipo", "Valor", "Moeda", "Origem", "Destino"];
const typeLabels: Record<string, string> = {
	EXPENSE: "Despesa",
	INCOME: "Receita",
	TRANSFER: "Transferência",
};

// Evita que planilhas interpretem texto livre como fórmula.
function textCell(value: string | null | undefined) {
	const text = value ?? "";
	return /^[=+\-@\t\r]/.test(text) ? `'${text}` : text;
}

function escapeCell(value: string) {
	return /[",\r\n]/.test(value) ? `"${value.replaceAll('"', '""')}"` : value;
}

function signedAmount(transaction: Transaction, perspectiveAccountId: string) {
	const amount = String(transaction.amount);
	if (Number(amount) === 0) return amount;
	const outgoing =
		transaction.type === "TRANSFER"
			? transaction.originFinancialAccountId === perspectiveAccountId &&
				transaction.destinationFinancialAccountId !== perspectiveAccountId
			: transaction.type === "EXPENSE";
	return outgoing ? `-${amount.replace(/^-/, "")}` : amount;
}

export function buildStatementCsv(transactions: Transaction[], perspectiveAccountId: string) {
	const rows = transactions.map(transaction =>
		[
			transaction.date.slice(0, 10),
			textCell(getTransactionTitle(transaction)),
			typeLabels[transaction.type] ?? transaction.type,
			signedAmount(transaction, perspectiveAccountId),
			transaction.bookingCurrency ?? "BRL",
			textCell(transaction.originName || transaction.sourceName),
			textCell(transaction.destinationName),
		].map(escapeCell),
	);
	return `﻿${[header, ...rows].map(row => row.join(",")).join("\r\n")}\r\n`;
}

export function downloadCsv(filename: string, content: string) {
	const url = URL.createObjectURL(new Blob([content], { type: "text/csv;charset=utf-8" }));
	const link = document.createElement("a");
	link.href = url;
	link.download = filename;
	link.click();
	URL.revokeObjectURL(url);
}
