import { toMinorUnits } from "@zaimu/finance/money";
import { HttpException } from "~/shared/errors";

export interface RewardsAccountDetails {
	conversionAmount?: null | number;
	conversionPoints?: null | number;
	initialBalance: number | string;
	kind: string;
}

export function assertRewardsAccountDetails(details: RewardsAccountDetails, currency = "BRL") {
	if (details.kind !== "POINTS" && details.kind !== "CASHBACK")
		throw new HttpException("Selecione uma modalidade de recompensas válida", 400);
	if (!/^[0-9]+(?:[.][0-9]{1,18})?$/.test(String(details.initialBalance)))
		throw new HttpException("O saldo inicial deve ser um decimal não negativo", 400);
	// Cashback is denominated in its native holding asset, not the account's fiat conversion currency.
	// Its exact decimal quantity is persisted unchanged; POINTS conversion remains fiat-only.
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
