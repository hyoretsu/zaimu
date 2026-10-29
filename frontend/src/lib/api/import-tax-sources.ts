import client from "./client-api";

export async function getImportTaxSources(importId: string) {
	return (
		await client<{ id: string; description: string; installmentAmount: number }[], unknown, unknown>({
			method: "GET",
			url: `/credit-card-imports/${encodeURIComponent(importId)}/tax-sources`,
		})
	).data;
}
