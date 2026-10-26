import { HttpException } from "~/shared/errors";
import type { Statement } from "./statement";

const entryPattern =
	/^(\d{2})\/(\d{2})\/(\d{4})\s+\d+\s+([A-Z\d-]+)\s*(.*?)\s+([\d.]+,\d{2})\s+\(([+-])\)$/iu;
const extractedEntryPattern =
	/^(\d{2})\/(\d{2})\/(\d{4})\s+([\d.]+,\d{2})\s+\(([+-])\)\s+\d+\s+([A-Z\d-]+)(?:\s+(.*))?$/iu;
const periodPattern = /Período:\s*(\d{2})\s+a\s+(\d{2})\/(\d{2})\/(\d{4})/iu;
const parseCurrency = (value: string) => Number(value.replaceAll(".", "").replace(",", "."));
const cleanDescription = (parts: string[]) => parts.join(" ").replace(/\s+/gu, " ").trim();

function parseEntry(line: string) {
	const visualOrder = line.match(entryPattern);
	if (visualOrder)
		return {
			amount: visualOrder[6],
			date: `${visualOrder[3]}-${visualOrder[2]}-${visualOrder[1]}`,
			description: visualOrder[5],
			document: visualOrder[4],
			sign: visualOrder[7],
		};
	const extractedOrder = line.match(extractedEntryPattern);
	if (!extractedOrder) return null;
	return {
		amount: extractedOrder[4],
		date: `${extractedOrder[3]}-${extractedOrder[2]}-${extractedOrder[1]}`,
		description: extractedOrder[7] ?? "",
		document: extractedOrder[6],
		sign: extractedOrder[5],
	};
}

export function parseBancoDoBrasilStatementText(text: string): Statement {
	text = text.replaceAll("−", "-");
	if (!/Extrato de Conta Corrente/iu.test(text) || !/Lançamentos/iu.test(text))
		throw new HttpException("O arquivo não parece ser um extrato Banco do Brasil válido", 400);
	const period = text.match(periodPattern);
	const transactions: Statement["transactions"] = [];
	let current: {
		amount: number;
		date: string;
		description: string[];
		externalId: string;
		type: "EXPENSE" | "INCOME";
	} | null = null;
	let pendingDescription: string[] = [];
	const flush = () => {
		if (!current) return;
		transactions.push({ ...current, description: cleanDescription(current.description) });
		current = null;
	};
	for (const rawLine of text.split("\n")) {
		const line = rawLine.trim();
		if (!line) continue;
		if (/^(?:SALDO|Informações Adicionais|Total Aplicações Financeiras)/iu.test(line)) {
			flush();
			pendingDescription = [];
			continue;
		}
		const entry = parseEntry(line);
		if (entry) {
			flush();
			current = {
				amount: parseCurrency(entry.amount),
				date: entry.date,
				description: [...pendingDescription, entry.description].filter(Boolean),
				externalId: `banco-do-brasil:${entry.document}`,
				type: entry.sign === "+" ? "INCOME" : "EXPENSE",
			};
			pendingDescription = [];
			continue;
		}
		if (/^\d{2}\/\d{2}\/\d{4}\b/u.test(line)) continue;
		if (/^Pix\s*-/iu.test(line)) {
			if (current && current.description.length === 0) current.description.push(line);
			else {
				flush();
				pendingDescription = [line];
			}
			continue;
		}
		if (current) current.description.push(line);
	}
	flush();
	if (!transactions.length)
		throw new HttpException("Nenhuma movimentação foi encontrada no extrato Banco do Brasil", 400);
	return {
		periodEnd: period ? `${period[4]}-${period[3]}-${period[2]}` : undefined,
		periodStart: period ? `${period[4]}-${period[3]}-${period[1]}` : undefined,
		provider: "BANCO_DO_BRASIL",
		transactions,
	};
}
