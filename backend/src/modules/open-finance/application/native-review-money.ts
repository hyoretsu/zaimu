import { roundMoney } from "@zaimu/finance/money";
import { ensureCurrencyRates } from "~/modules/currencies/infra/currency-exchange";
import type { NormalizedRecord } from "../domain/normalize";

export async function nativeReviewMoney(
	remote: NormalizedRecord,
	currency: string,
	rate = ensureCurrencyRates,
): Promise<NormalizedRecord> {
	if (remote.currency === currency) return remote;
	const factor = await rate(remote.date, remote.currency, currency);
	return {
		...remote,
		amount: roundMoney(remote.amount * factor, currency),
		currency,
		totalAmount:
			remote.totalAmount == null ? remote.totalAmount : roundMoney(remote.totalAmount * factor, currency),
	};
}
