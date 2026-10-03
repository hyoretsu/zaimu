import { createHash } from "node:crypto";
import type { RemoteBill, RemoteTransaction } from "../infra/pluggy-client";

export type Operation = "TRANSACTION" | "PURCHASE" | "PAYMENT" | "REFUND" | "CHARGE";
export interface NormalizedRecord {
	aliases: string[];
	identity: string;
	date: string;
	time: string | null;
	amount: number;
	description: string;
	operation: Operation;
	pending: boolean;
	currency: string;
	installments: number;
	installmentNumber: number;
	totalAmount: number | null;
	statementDate: string | null;
	dueDate: string | null;
	incomplete: string[];
}
export const normalizeDescription = (value: string) =>
	value
		.normalize("NFD")
		.replace(/\p{Diacritic}/gu, "")
		.toLowerCase()
		.replace(/\s+/g, " ")
		.trim();
export function bankDate(value: string) {
	const date = /^\d{4}-\d{2}-\d{2}/.exec(value)?.[0];
	if (
		!date ||
		Number.isNaN(Date.parse(date)) ||
		new Date(`${date}T00:00:00Z`).toISOString().slice(0, 10) !== date
	)
		throw new Error("Data bancária inválida");
	return date;
}
// Transaction date is a banking date, often serialized at technical midnight.
// Only explicitly supplied purchaseTime is an actual time of purchase.
export function bankTime(value?: string) {
	if (!value) return null;
	const time = /^(\d{2}):(\d{2})(?::(\d{2}))?$/.exec(value);
	return time && Number(time[1]) < 24 && Number(time[2]) < 60 && Number(time[3] ?? 0) < 60
		? `${time[1]}:${time[2]}:${time[3] ?? "00"}`
		: null;
}
export function classifyOperation(tx: RemoteTransaction, card: boolean): Operation {
	const kind = (tx.operationType ?? tx.creditCardMetadata?.type ?? "").toUpperCase();
	if (
		["PAYMENT", "BILL_PAYMENT", "CREDIT_CARD_PAYMENT"].includes(kind) ||
		/^(pagamento (de |da )?fatura|pagamento recebido|payment received)$/i.test(tx.description.trim())
	)
		return "PAYMENT";
	if (!card) return "TRANSACTION";
	if (["REFUND", "REVERSAL"].includes(kind) || tx.amount < 0) return "REFUND";
	if (["FEE", "INTEREST", "CHARGE", "IOF"].includes(kind)) return "CHARGE";
	return "PURCHASE";
}
export function normalizeTransaction(
	tx: RemoteTransaction,
	card: boolean,
	bills: RemoteBill[] = [],
): NormalizedRecord {
	if (!tx.id || !Number.isFinite(tx.amount) || !tx.description?.trim())
		throw new Error("Transação bancária inválida");
	const metadata = tx.creditCardMetadata;
	const operation = classifyOperation(tx, card);
	const installments = metadata?.totalInstallments ?? 1;
	const installmentNumber = metadata?.installmentNumber ?? 1;
	const bill = bills.find(b => b.id === metadata?.billId);
	const totalAmount = card
		? (metadata?.totalAmount ?? (installments === 1 ? Math.abs(tx.amount) : null))
		: Math.abs(tx.amount);
	const incomplete: string[] = [];
	if (card && operation !== "PAYMENT") {
		if (!bill?.closingDate || !bill.dueDate) incomplete.push("calendar");
		if (!Number.isFinite(totalAmount) || totalAmount === null || totalAmount <= 0) incomplete.push("total");
		if (
			!Number.isInteger(installments) ||
			!Number.isInteger(installmentNumber) ||
			installmentNumber < 1 ||
			installmentNumber > installments
		)
			incomplete.push("installments");
		if (installments > 1 && !metadata?.purchaseDate) incomplete.push("purchaseDate");
	}
	return {
		aliases: [tx.providerId ? `provider:${tx.providerId}` : null, `pluggy:${tx.id}`].filter(
			(id): id is string => Boolean(id),
		),
		amount: Number(tx.amount.toFixed(2)),
		currency: tx.currencyCode ?? "BRL",
		date: bankDate(metadata?.purchaseDate ?? tx.date),
		description: tx.description.trim(),
		dueDate: bill?.dueDate ? bankDate(bill.dueDate) : null,
		identity: tx.providerId ? `provider:${tx.providerId}` : `pluggy:${tx.id}`,
		incomplete,
		installmentNumber,
		installments,
		operation,
		pending: tx.status === "PENDING",
		statementDate: bill?.closingDate ? bankDate(bill.closingDate) : null,
		time: bankTime(metadata?.purchaseTime),
		totalAmount,
	};
}
export const externalReference = (userId: string, accountId: string, identity: string) =>
	`meupluggy:${createHash("sha256").update(`${userId}:${accountId}:${identity}`).digest("hex")}`;
export function exactMatch(a: NormalizedRecord, b: NormalizedRecord) {
	return (
		a.date === b.date &&
		a.amount === b.amount &&
		a.currency === b.currency &&
		a.operation === b.operation &&
		normalizeDescription(a.description) === normalizeDescription(b.description) &&
		(!a.time || !b.time || a.time === b.time) &&
		a.installments === b.installments &&
		a.installmentNumber === b.installmentNumber
	);
}
