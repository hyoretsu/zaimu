import { CurrencyProviderError, fetchCurrencySnapshot } from "@zaimu/finance/currency-provider";
import type { EventEnvelope } from "~/shared/application/events";
import { queryRaw, withRawTransaction } from "~/shared/infra/sql";
import { completeHistoryUnit, runHistoryUnit } from "./history-collections";
import { withProviderSlot } from "./provider-slots";

export async function handleCurrencyHistoryCommand(event: EventEnvelope) {
	await runHistoryUnit(event, async (unit, assertLease) => {
		let snapshot: Awaited<ReturnType<typeof fetchCurrencySnapshot>> | null;
		try {
			snapshot = await withProviderSlot("currency-api", 6, () =>
				fetchCurrencySnapshot(unit.startDate, unit.series),
			);
		} catch (error) {
			if (!(error instanceof CurrencyProviderError) || !error.unavailable) throw error;
			snapshot = null;
		}
		const state = snapshot ? "COMPLETED" : "NO_DATA";
		await withRawTransaction(async () => {
			await assertLease();
			if (snapshot)
				await queryRaw(
					`INSERT INTO "CurrencyRateSnapshot" ("date","baseCurrency","rates") VALUES ($1::date,$2,$3::jsonb) ON CONFLICT ("date","baseCurrency") DO NOTHING`,
					[snapshot.date, snapshot.baseCurrency, JSON.stringify(snapshot.rates)],
				);
			await completeHistoryUnit(unit.id, state);
		});
		return state;
	});
}
