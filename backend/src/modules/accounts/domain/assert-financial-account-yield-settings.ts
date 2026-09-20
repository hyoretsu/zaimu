import { HttpException } from "~/shared/errors";

export function assertFinancialAccountYieldSettings(settings: {
	type: string;
	yieldFixedRate?: null | number;
	yieldPeriod?: null | string;
	yieldReferencePercentage?: null | number;
	yieldReferenceType?: null | string;
	yieldTaxRate?: null | number;
}) {
	const hasFixedRate = settings.yieldFixedRate !== undefined && settings.yieldFixedRate !== null;
	const hasPeriod = settings.yieldPeriod !== undefined && settings.yieldPeriod !== null;
	const hasReferencePercentage =
		settings.yieldReferencePercentage !== undefined && settings.yieldReferencePercentage !== null;
	const hasReferenceType = settings.yieldReferenceType !== undefined && settings.yieldReferenceType !== null;
	const hasTaxRate = settings.yieldTaxRate !== undefined && settings.yieldTaxRate !== null;
	const hasYield = hasFixedRate || hasReferencePercentage || hasReferenceType;
	if (settings.type === "CREDIT_CARD" && (hasYield || hasPeriod || hasTaxRate))
		throw new HttpException("Cartão de crédito não pode ter rendimento", 400);
	if (hasFixedRate && !hasPeriod) throw new HttpException("Informe o período da taxa fixa", 400);
	if (!hasFixedRate && hasPeriod) throw new HttpException("Remova o período sem uma taxa fixa", 400);
	if (hasReferenceType !== hasReferencePercentage)
		throw new HttpException("Informe a taxa de referência e o percentual juntos", 400);
	if (hasTaxRate && !hasYield)
		throw new HttpException("Informe a alíquota de imposto junto com as taxas do rendimento", 400);
	if (
		(hasFixedRate && settings.yieldFixedRate! <= 0) ||
		(hasReferencePercentage && settings.yieldReferencePercentage! <= 0)
	)
		throw new HttpException("As taxas do rendimento devem ser maiores que zero", 400);
	if (hasTaxRate && (settings.yieldTaxRate! < 0 || settings.yieldTaxRate! > 100))
		throw new HttpException("A alíquota de imposto deve estar entre 0% e 100%", 400);
	if (hasPeriod && settings.yieldPeriod !== "MONTHLY" && settings.yieldPeriod !== "YEARLY")
		throw new HttpException("Selecione um período de rendimento válido", 400);
	if (hasReferenceType && settings.yieldReferenceType !== "CDI" && settings.yieldReferenceType !== "SELIC")
		throw new HttpException("Selecione uma taxa de referência válida", 400);
}
