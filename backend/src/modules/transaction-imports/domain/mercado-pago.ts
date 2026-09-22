import { HttpException } from "~/shared/errors";
import type { Statement } from "./statement";

const datePattern = /(\d{2})-(\d{2})-(\d{4})/;
const movementPattern =
	/(\d{2}-\d{2}-\d{4})\s+([\s\S]*?)\s+(\d{8,})\s+R\$\s*(-?[\d.]+,\d{2})\s+R\$\s*(-?[\d.]+,\d{2})/g;
const yieldDescriptionPattern = /rendimentos?/i;

const toDate = (value: string) => {
	const match = value.match(datePattern);
	if (!match) throw new HttpException("Data inválida no extrato Mercado Pago", 400);
	return `${match[3]}-${match[2]}-${match[1]}`;
};

const parseCurrency = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));

export function parseMercadoPagoStatementText(text: string): Statement {
	if (!text.includes("EXTRATO DE CONTA") || !text.includes("ID da operação")) {
		throw new HttpException("O arquivo não parece ser um extrato Mercado Pago válido", 400);
	}

	const movementStart = text.indexOf("ID da operação");
	const movementsText = (movementStart >= 0 ? text.slice(movementStart) : text)
		.replace(/Data de geração:[\s\S]*?Data\s+Descrição\s+ID da operação\s+Valor\s+Saldo/gu, "")
		.replace(
			/Data de geração:[\s\S]*?(?:\d+\/\d+|--\s+\d+\s+of\s+\d+\s+--)(?=\s*(?:\d{2}-\d{2}-\d{4}|$))/gu,
			"",
		)
		.replace(/(?:\d+\/\d+\s+)?Data\s+Descrição\s+ID da operação\s+Valor\s+Saldo/gu, "")
		.replace(/^\s*\d+\/\d+\s*$/gmu, "")
		.replace(/--\s+\d+\s+of\s+\d+\s+--/gu, "");
	const transactions: Statement["transactions"] = [];
	let previousMatchEnd = 0;
	for (const match of movementsText.matchAll(movementPattern)) {
		const leadingDescription = previousMatchEnd
			? movementsText.slice(previousMatchEnd, match.index).replace(/\s+/g, " ").trim()
			: "";
		const signedAmount = parseCurrency(match[4]);
		const balanceAfter = parseCurrency(match[5]);
		if (!Number.isFinite(signedAmount) || !Number.isFinite(balanceAfter)) continue;
		const description = `${leadingDescription} ${match[2]}`.replace(/\s+/g, " ").trim();
		transactions.push({
			amount: Math.abs(signedAmount),
			balanceAfter,
			date: toDate(match[1]),
			description,
			externalId: match[3],
			type: signedAmount < 0 ? "EXPENSE" : yieldDescriptionPattern.test(description) ? "YIELD" : "INCOME",
		});
		previousMatchEnd = (match.index ?? 0) + match[0].length;
	}

	if (transactions.length === 0) {
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato Mercado Pago", 400);
	}

	const period = text.match(/De\s+(\d{2}-\d{2}-\d{4})\s+(?:al|a|até)\s+(\d{2}-\d{2}-\d{4})/i);
	return {
		periodEnd: period ? toDate(period[2]) : undefined,
		periodStart: period ? toDate(period[1]) : undefined,
		provider: "MERCADO_PAGO",
		transactions,
	};
}
