import { decimalToUnits, unitsToDecimal } from "@zaimu/finance/asset-amount";
import { isCryptoAsset } from "@zaimu/finance/money";

export interface AccountAsset {
	assetCode: string;
	balance: string;
}

/** Old single-currency guest records are read without rewriting their institutional metadata. */
export function normalizeAccountAssets<
	T extends {
		type: string;
		yieldCurrency?: string | null;
		assets?: AccountAsset[];
		currency?: string | null;
		balance?: number | null;
	},
>(account: T) {
	const { currency, balance, ...rest } = account;
	const yieldCurrency = account.yieldCurrency !== undefined ? account.yieldCurrency : (currency ?? "BRL");
	const points =
		account.type === "REWARDS" &&
		"rewardsAccount" in account &&
		(account.rewardsAccount as { kind?: string } | null)?.kind === "POINTS";
	return {
		...rest,
		yieldCurrency,
		...(points && balance != null ? { pointsBalance: balance } : {}),
		assets:
			account.type === "CREDIT_CARD" || points
				? []
				: (account.assets ??
					(yieldCurrency ? [{ assetCode: yieldCurrency, balance: String(balance ?? 0) }] : [])),
	};
}

export function groupAccountAssets(accounts: { assets: AccountAsset[] }[]) {
	const totals = new Map<string, bigint>();
	for (const account of accounts)
		for (const asset of account.assets)
			totals.set(
				asset.assetCode,
				(totals.get(asset.assetCode) ?? 0n) + decimalToUnits(asset.balance, asset.assetCode),
			);
	return [...totals].map(([currency, units]) => ({ amount: unitsToDecimal(units, currency), currency }));
}

export function assetBalance(assets: AccountAsset[], assetCode: string) {
	return assets.find(asset => asset.assetCode === assetCode)?.balance ?? "0";
}

/** Only fiat may enter the existing yield/tax engine. */
export function fiatAccountBalance(account: { assets: AccountAsset[]; yieldCurrency: string | null }) {
	if (!account.yieldCurrency) return 0;
	if (isCryptoAsset(account.yieldCurrency)) throw new Error("Rendimento exige moeda fiduciária");
	return Number(assetBalance(account.assets, account.yieldCurrency));
}

interface AssetMovement {
	id?: string;
	date?: string | Date;
	amount: number | string;
	bookingCurrency?: string | null;
	currency?: string | null;
	destinationAmount?: number | string | null;
	destinationCurrency?: string | null;
	fees?: { amount: number | string; assetCode?: string; type: string }[];
	originFinancialAccountId?: string | null;
	destinationFinancialAccountId?: string | null;
}

/** Replay native holdings with scaled integers; cross-asset sides never share an amount. */
export function replayAccountAssets(
	accountId: string,
	transactions: AssetMovement[],
	adjustments: { assetCode?: string; currency?: string; balance: string | number; date: string }[],
	fallbackCurrency: string | null,
	today: string,
): AccountAsset[] {
	const balances = new Map<string, bigint>();
	const events: { date: string; id: string; assetCode: string; amount: string; checkpoint: boolean }[] = [];
	const textAmount = (value: string | number, code: string) => {
		if (isCryptoAsset(code) && typeof value !== "string")
			throw new Error("Quantidade crypto exige decimal exato");
		return String(value);
	};
	for (const movement of transactions) {
		const date =
			typeof movement.date === "string"
				? movement.date.slice(0, 10)
				: movement.date
					? `${movement.date.getFullYear()}-${String(movement.date.getMonth() + 1).padStart(2, "0")}-${String(movement.date.getDate()).padStart(2, "0")}`
					: today;
		const originCode = movement.bookingCurrency ?? movement.currency ?? fallbackCurrency;
		if (!originCode) {
			if (
				movement.originFinancialAccountId === accountId ||
				movement.destinationFinancialAccountId === accountId
			)
				throw new Error("Informe o ativo da transação");
			continue;
		}
		if (movement.originFinancialAccountId === accountId)
			events.push({
				amount: `-${textAmount(movement.amount, originCode)}`,
				assetCode: originCode,
				checkpoint: false,
				date,
				id: movement.id ?? "",
			});
		if (movement.originFinancialAccountId === accountId) {
			for (const fee of movement.fees ?? []) {
				const code: string = fee.assetCode ?? originCode;
				// Legacy fiat fees are already included in the booked debit.
				if (!isCryptoAsset(originCode) && (!fee.assetCode || code === originCode)) continue;
				let units: bigint;
				if (fee.type === "PERCENTAGE") {
					if (code !== originCode) throw new Error("Taxa percentual exige o ativo de origem");
					const text = String(fee.amount);
					if (!/^\d+(?:\.\d+)?$/.test(text)) throw new Error("Taxa inválida");
					const [whole, fraction = ""] = text.split(".");
					const divisor = 100n * 10n ** BigInt(fraction.length);
					const numerator =
						decimalToUnits(textAmount(movement.amount, code), code) * BigInt(whole + fraction);
					units = (numerator + divisor / 2n) / divisor;
				} else units = decimalToUnits(textAmount(fee.amount, code), code);
				if (units < 0n) throw new Error("Taxa inválida");
				events.push({
					amount: unitsToDecimal(-units, code),
					assetCode: code,
					checkpoint: false,
					date,
					id: movement.id ?? "",
				});
			}
		}
		if (movement.destinationFinancialAccountId === accountId) {
			const code = movement.destinationCurrency ?? originCode;
			if (code !== originCode && movement.destinationAmount == null)
				throw new Error("Informe o valor de destino na moeda do ativo");
			events.push({
				amount: textAmount(movement.destinationAmount ?? movement.amount, code),
				assetCode: code,
				checkpoint: false,
				date,
				id: movement.id ?? "",
			});
		}
	}
	for (const adjustment of adjustments) {
		const code = adjustment.assetCode ?? adjustment.currency ?? fallbackCurrency;
		if (!code) throw new Error("Informe o ativo do ajuste");
		events.push({
			amount: textAmount(adjustment.balance, code),
			assetCode: code,
			checkpoint: true,
			date: adjustment.date.slice(0, 10),
			id: "",
		});
	}
	for (const event of events.sort(
		(a, b) =>
			a.date.localeCompare(b.date) ||
			Number(a.checkpoint) - Number(b.checkpoint) ||
			a.id.localeCompare(b.id),
	)) {
		if (event.date > today) continue;
		const amount = decimalToUnits(event.amount, event.assetCode);
		balances.set(
			event.assetCode,
			event.checkpoint ? amount : (balances.get(event.assetCode) ?? 0n) + amount,
		);
	}
	return [...balances].map(([assetCode, balance]) => ({
		assetCode,
		balance: unitsToDecimal(balance, assetCode),
	}));
}
