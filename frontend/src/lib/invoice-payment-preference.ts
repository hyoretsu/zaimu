import type { InvoicePaymentTiming } from "@zaimu/finance/payment-suggestions";
import { useAuthStore } from "@/stores/auth";
import { fetchWithAuth } from "./dataService";
import { localMeta } from "./localStorage";
import { getCurrentCacheIdentity } from "./query-cache";

export const invoicePaymentPreferenceKey = (owner: string | null) => ["invoice-payment-preference", owner];
export async function readInvoicePaymentPreference(): Promise<InvoicePaymentTiming> {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!useAuthStore.getState().isGuestMode) {
		const result = await fetchWithAuth<{ invoicePaymentTiming: InvoicePaymentTiming }>(
			"/invoice-payment-preferences",
		);
		return result.invoicePaymentTiming;
	}
	const stored = await localMeta.get("invoice-payment-preference", owner);
	return stored === "CLOSING_DATE" ? stored : "DUE_DATE";
}
export async function saveInvoicePaymentPreference(invoicePaymentTiming: InvoicePaymentTiming) {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Sessão indisponível");
	if (!["CLOSING_DATE", "DUE_DATE"].includes(invoicePaymentTiming)) throw new Error("Preferência inválida");
	if (!useAuthStore.getState().isGuestMode)
		await fetchWithAuth("/invoice-payment-preferences", {
			body: JSON.stringify({ invoicePaymentTiming }),
			method: "PATCH",
		});
	else await localMeta.set("invoice-payment-preference", invoicePaymentTiming, owner);
}
