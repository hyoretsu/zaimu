import { toMinorUnits } from "@zaimu/finance/money";
import { HttpException } from "~/shared/errors";

export interface RewardsAccountDetails {
	conversionAmount?: null | number;
	conversionPoints?: null | number;
	initialBalance: number;
	kind: string;
}

export function assertRewardsAccountDetails(details: RewardsAccountDetails, currency = "BRL") {
	if (details.kind !== "POINTS" && details.kind !== "CASHBACK")
		throw new HttpException("Selecione uma modalidade de recompensas válida", 400);
	if (details.initialBalance < 0) throw new HttpException("O saldo inicial não pode ser negativo", 400);
	if (details.kind === "CASHBACK") toMinorUnits(details.initialBalance, currency);
	const hasPoints = details.conversionPoints !== undefined && details.conversionPoints !== null;
	const hasAmount = details.conversionAmount !== undefined && details.conversionAmount !== null;
	if (hasPoints !== hasAmount)
		throw new HttpException("Informe os pontos e o valor da conversão juntos", 400);
	if (hasPoints && (details.conversionPoints! <= 0 || details.conversionAmount! <= 0))
		throw new HttpException("A conversão deve usar valores maiores que zero", 400);
	if (hasAmount) toMinorUnits(details.conversionAmount!, currency, 1);
	if (details.kind === "CASHBACK" && hasPoints)
		throw new HttpException("Conversão está disponível somente para contas de pontos", 400);
}
