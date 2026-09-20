import { HttpException } from "~/shared/errors";
import type { InstitutionYieldRule, YieldPeriod } from "./calculate-financial-account-yields";

export function assertFinancialInstitutionYieldPolicy({
	rules,
	yieldPeriod,
	yieldTaxRate,
}: {
	rules: InstitutionYieldRule[];
	yieldPeriod?: null | YieldPeriod;
	yieldTaxRate?: null | number;
}) {
	if (rules.length === 0) {
		if (yieldPeriod || (yieldTaxRate !== null && yieldTaxRate !== undefined))
			throw new HttpException("Remova o período e o imposto ao desativar o rendimento", 400);
		return;
	}
	if (yieldTaxRate !== null && yieldTaxRate !== undefined && (yieldTaxRate < 0 || yieldTaxRate > 100))
		throw new HttpException("A alíquota de imposto deve estar entre 0% e 100%", 400);
	if (rules.length > 20) throw new HttpException("Cadastre no máximo 20 faixas de rendimento", 400);
	let previousLimit = 0;
	for (const [index, rule] of rules.entries()) {
		const isLast = index === rules.length - 1;
		if (rule.upToBalance === null || rule.upToBalance === undefined) {
			if (!isLast) throw new HttpException("Somente a última faixa pode não ter limite", 400);
		} else {
			if (isLast) throw new HttpException("A última faixa deve abranger o saldo excedente", 400);
			if (rule.upToBalance <= previousLimit)
				throw new HttpException("Os limites das faixas devem ser crescentes", 400);
			previousLimit = rule.upToBalance;
		}
		const hasReferenceType = rule.yieldReferenceType !== null && rule.yieldReferenceType !== undefined;
		const hasReferencePercentage =
			rule.yieldReferencePercentage !== null && rule.yieldReferencePercentage !== undefined;
		if (hasReferenceType !== hasReferencePercentage)
			throw new HttpException("Informe a taxa de referência e o percentual juntos", 400);
		const hasFixed = rule.yieldFixedRate !== null && rule.yieldFixedRate !== undefined;
		if (!hasFixed && !hasReferenceType)
			throw new HttpException("Cada faixa deve ter uma taxa maior que zero", 400);
		if (hasFixed && !yieldPeriod) throw new HttpException("Selecione o período da taxa fixa", 400);
	}
}
