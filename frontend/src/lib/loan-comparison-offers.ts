import { shiftMonths } from "@zaimu/finance/financial-indicators";
import type { LoanComparisonOffer, PixCreditOffer } from "@zaimu/finance/loan-comparison";
import { z } from "zod";
import { getLocalDateKey } from "./date";

export type EditableOffer = LoanComparisonOffer | PixCreditOffer;
export interface LoanComparisonDraft {
	offers: EditableOffer[];
	existingLoanIds: string[];
	/** Monthly percent; null follows the projected CDI. */
	opportunityRate: number | null;
}

const money = z.number().finite().min(0).max(1e12);
const civilDate = z.iso.date();
const rate = z.object({
	basis: z.enum(["CALENDAR_365", "BUSINESS_252"]).optional(),
	fixedPeriod: z.enum(["MONTHLY", "YEARLY"]).optional(),
	fixedRate: z.number().finite().min(-100).max(1000).nullable().optional(),
	indicator: z.enum(["CDI", "SELIC", "IPCA", "TR"]).nullable().optional(),
	lagMonths: z.number().int().min(0).max(24).optional(),
	negativeFloor: z.boolean().optional(),
	percentage: z.number().finite().min(0).max(1000).nullable().optional(),
});
const loanOffer = z.object({
	id: z.string().max(100),
	kind: z.literal("LOAN"),
	name: z.string().max(120),
	quotedInstallment: money.nullable().optional(),
	terms: z.object({
		amortization: z.enum(["PRICE", "SAC", "MANUAL"]),
		charges: z
			.array(
				z.object({
					amount: money,
					financed: z.boolean(),
					name: z.string().max(120),
					recurring: z.boolean(),
				}),
			)
			.max(20),
		currency: z.string().min(3).max(10),
		discount: z.enum(["PRESENT_VALUE", "NO_DISCOUNT"]),
		firstDueDate: civilDate,
		graceInterest: z.enum(["PAY", "CAPITALIZE"]),
		graceMonths: z.number().int().min(0).max(120),
		lateFinePercent: z.number().finite().min(0).max(100),
		lateMonthlyPercent: z.number().finite().min(0).max(100),
		principalAmount: money,
		rate,
		startDate: civilDate,
		totalInstallments: z.number().int().min(1).max(600),
	}),
});
const pixOffer = z.object({
	amount: money,
	closingDay: z.number().int().min(1).max(31),
	currency: z.string().min(3).max(10),
	dueDay: z.number().int().min(1).max(31),
	fee: money,
	id: z.string().max(100),
	installments: z.number().int().min(1).max(48),
	iof: money,
	kind: z.literal("PIX_CREDIT"),
	monthlyRate: z.number().finite().min(0).max(100).nullable().optional(),
	name: z.string().max(120),
	pixDate: civilDate,
	quotedInstallment: money.nullable().optional(),
	quotedTotal: money.nullable().optional(),
});
const offers = z.array(z.discriminatedUnion("kind", [loanOffer, pixOffer])).max(12);
const draftSchema = z.object({
	existingLoanIds: z.array(z.string().max(200)).max(12),
	offers,
	opportunityRate: z.number().finite().min(0).max(100).nullable(),
	version: z.literal(1),
});
const shareSchema = z.object({ o: offers, v: z.literal(1) });

export const maxComparisonOffers = 12;
const draftKey = "zaimu:tools:loan-comparison:v1";

export function newLoanOffer(currency: string, index: number): LoanComparisonOffer {
	const today = getLocalDateKey();
	return {
		id: crypto.randomUUID(),
		kind: "LOAN",
		name: `Empréstimo ${index}`,
		quotedInstallment: null,
		terms: {
			amortization: "PRICE",
			charges: [],
			currency,
			discount: "PRESENT_VALUE",
			firstDueDate: shiftMonths(today, 1),
			graceInterest: "PAY",
			graceMonths: 0,
			lateFinePercent: 0,
			lateMonthlyPercent: 0,
			principalAmount: 0,
			rate: { fixedPeriod: "MONTHLY", fixedRate: 0 },
			startDate: today,
			totalInstallments: 12,
		},
	};
}

export function newPixCreditOffer(currency: string, index: number): PixCreditOffer {
	return {
		amount: 0,
		closingDay: 1,
		currency,
		dueDay: 10,
		fee: 0,
		id: crypto.randomUUID(),
		installments: 12,
		iof: 0,
		kind: "PIX_CREDIT",
		monthlyRate: null,
		name: `Pix no crédito ${index}`,
		pixDate: getLocalDateKey(),
		quotedInstallment: null,
		quotedTotal: null,
	};
}

export function readComparisonDraft(): LoanComparisonDraft | null {
	try {
		const raw = globalThis.localStorage?.getItem(draftKey);
		if (!raw) return null;
		const parsed = draftSchema.safeParse(JSON.parse(raw));
		if (!parsed.success) return null;
		const { version: _, ...draft } = parsed.data;
		return draft as LoanComparisonDraft;
	} catch {
		return null;
	}
}

export function writeComparisonDraft(draft: LoanComparisonDraft) {
	try {
		globalThis.localStorage?.setItem(draftKey, JSON.stringify({ ...draft, version: 1 }));
	} catch {
		// Storage full or blocked: the comparison keeps working in memory.
	}
}

export function clearComparisonDraft() {
	globalThis.localStorage?.removeItem(draftKey);
}

function toBase64Url(text: string) {
	const bytes = new TextEncoder().encode(text);
	let binary = "";
	for (const byte of bytes) binary += String.fromCharCode(byte);
	return btoa(binary).replaceAll("+", "-").replaceAll("/", "_").replace(/=+$/, "");
}

function fromBase64Url(value: string) {
	const binary = atob(value.replaceAll("-", "+").replaceAll("_", "/"));
	return new TextDecoder().decode(Uint8Array.from(binary, char => char.charCodeAt(0)));
}

/** Share links carry only typed offers; contracts of the signed-in user never leave the device. */
export function encodeSharedOffers(list: EditableOffer[]) {
	return toBase64Url(JSON.stringify({ o: list, v: 1 }));
}

export function decodeSharedOffers(value: string): EditableOffer[] | null {
	try {
		const parsed = shareSchema.safeParse(JSON.parse(fromBase64Url(value)));
		if (!parsed.success) return null;
		// Fresh ids keep imported offers distinct from local ones.
		return parsed.data.o.map(offer => ({ ...offer, id: crypto.randomUUID() })) as EditableOffer[];
	} catch {
		return null;
	}
}
