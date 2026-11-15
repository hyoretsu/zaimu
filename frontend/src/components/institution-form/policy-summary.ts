import { countryName } from "@/lib/countries";
import { YIELD_ACCOUNT_TYPES } from "@/routes/accounts/components/InstitutionYieldDialog/policy-selection";

export interface PolicyLike {
	accountType?: string | null;
	countryCode?: string | null;
	effectiveDate: string;
	effectiveUntil?: string | null;
	requestedEffectiveDate?: string;
	rules: {
		upToBalance?: number | null;
		yieldFixedRate?: number | null;
		yieldReferencePercentage?: number | null;
		yieldReferenceType?: string | null;
	}[];
	yieldPeriod?: string | null;
	yieldTaxRate?: number | null;
}

const number = (value: number) => value.toLocaleString("pt-BR", { maximumFractionDigits: 4 });
const day = (value: string) => value.slice(0, 10).split("-").reverse().join("/");

/** Scope of a policy: country and account type ("Todos os países - Todos os tipos"). */
export function policyScope(policy: Pick<PolicyLike, "accountType" | "countryCode">) {
	return [
		policy.countryCode ? countryName(policy.countryCode) : "Todos os países",
		YIELD_ACCOUNT_TYPES.find(type => type.value === policy.accountType)?.label ?? "Todos os tipos",
	].join(" - ");
}

/** Period of validity in pt-BR; the open-start sentinel reads as "todo o período anterior". */
export function policyPeriod(policy: PolicyLike) {
	const start = (policy.requestedEffectiveDate ?? policy.effectiveDate).slice(0, 10);
	const from = start === "1970-01-01" ? "todo o período anterior" : `a partir de ${day(start)}`;
	return policy.effectiveUntil ? `${from} até ${day(policy.effectiveUntil)}` : from;
}

/** One readable line per yield tier. */
export function policyTiers(policy: PolicyLike) {
	return policy.rules.map((rule, index) => {
		const parts = [
			rule.yieldFixedRate
				? `${number(rule.yieldFixedRate)}% ${policy.yieldPeriod === "YEARLY" ? "ao ano" : "ao mês"}`
				: "",
			rule.yieldReferenceType
				? `${number(rule.yieldReferencePercentage ?? 100)}% do ${rule.yieldReferenceType}`
				: "",
		].filter(Boolean);
		const limit =
			rule.upToBalance != null
				? `Até ${number(rule.upToBalance)}`
				: policy.rules.length > 1
					? "Acima disso"
					: "Todo o saldo";
		return `${limit}: ${parts.join(" + ") || "sem rendimento"}${index === policy.rules.length - 1 && policy.yieldTaxRate ? ` (imposto ${number(policy.yieldTaxRate)}%)` : ""}`;
	});
}
