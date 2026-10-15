import type { FinancialInstitution } from "@/lib/api";

export type AdminInstitution = FinancialInstitution & {
	accountCurrenciesByCountry?: Record<string, string[]>;
	userId?: string | null;
};
