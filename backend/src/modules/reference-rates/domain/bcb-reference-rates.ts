import { format } from "date-fns";
export type ReferenceRateType = "CDI" | "SELIC";
const seriesCodes: Record<ReferenceRateType, number> = { CDI: 12, SELIC: 11 };
const responseDatePattern = /^(\d{2})\/(\d{2})\/(\d{4})$/;
export interface ReferenceRateValue {
	date: Date;
	value: number;
}
export function buildBcbReferenceRateUrl(type: ReferenceRateType, startDate: Date, endDate: Date) {
	const url = new URL(`https://api.bcb.gov.br/dados/serie/bcdata.sgs.${seriesCodes[type]}/dados`);
	url.searchParams.set("formato", "json");
	url.searchParams.set("dataInicial", format(startDate, "dd/MM/yyyy"));
	url.searchParams.set("dataFinal", format(endDate, "dd/MM/yyyy"));
	return url;
}
export function parseBcbReferenceRateResponse(input: unknown): ReferenceRateValue[] {
	if (!Array.isArray(input)) throw new Error("Resposta inválida do Banco Central");
	return input.map((entry, index) => {
		if (!entry || typeof entry !== "object") throw new Error(`Taxa inválida na posição ${index}`);
		const { data, valor } = entry as Record<string, unknown>;
		if (typeof data !== "string" || typeof valor !== "string")
			throw new Error(`Taxa inválida na posição ${index}`);
		const match = responseDatePattern.exec(data);
		if (!match) throw new Error(`Data inválida recebida do Banco Central: ${data}`);
		const [, day, month, year] = match;
		const date = new Date(`${year}-${month}-${day}T12:00:00`);
		if (
			Number.isNaN(date.valueOf()) ||
			date.getFullYear() !== Number(year) ||
			date.getMonth() + 1 !== Number(month) ||
			date.getDate() !== Number(day)
		)
			throw new Error(`Data inválida recebida do Banco Central: ${data}`);
		const value = Number(valor);
		if (!Number.isFinite(value) || value < 0)
			throw new Error(`Valor inválido recebido do Banco Central: ${valor}`);
		return { date, value };
	});
}
export async function fetchBcbReferenceRates(
	type: ReferenceRateType,
	startDate: Date,
	endDate: Date,
	request: typeof fetch = fetch,
) {
	const response = await request(buildBcbReferenceRateUrl(type, startDate, endDate), {
		headers: { Accept: "application/json" },
		signal: AbortSignal.timeout(30_000),
	});
	if (!response.ok) {
		const error = new Error(`Banco Central respondeu HTTP ${response.status}`) as Error & {
			retryAfter?: string;
		};
		error.retryAfter = response.headers.get("retry-after") ?? undefined;
		throw error;
	}
	return parseBcbReferenceRateResponse(await response.json());
}
