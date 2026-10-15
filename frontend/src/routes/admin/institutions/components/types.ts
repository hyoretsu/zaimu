import type { FinancialInstitution } from "@/lib/api";

export type AdminInstitution = FinancialInstitution & { userId?: string | null };
