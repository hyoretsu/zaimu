import { describe, expect, test } from "bun:test";
import {
	fiatAccountBalance,
	groupAccountAssets,
	normalizeAccountAssets,
	primaryCurrency,
	replayAccountAssets,
} from "./account-assets";
import type { FinancialAccount } from "./api";
import { calculateFinancialAccountBalances } from "./financial-account";

describe("guest native holdings", () => {
	test("remote POINTS scalar survives normalization without monetary holdings", () => {
		const points = normalizeAccountAssets({
			assets: [],
			balance: 123.5,
			rewardsAccount: { kind: "POINTS" },
			type: "REWARDS",
			yieldCurrency: null,
		});
		expect(points.pointsBalance).toBe(123.5);
		expect(points.assets).toEqual([]);
		const again = normalizeAccountAssets(points);
		expect(again.pointsBalance).toBe(123.5);
	});
	test("crypto reward initial quantity adds one wei credit exactly", () => {
		const account: FinancialAccount = {
			assets: [],
			createdAt: "2026-01-01",
			id: "reward",
			name: null,
			rewardsAccount: {
				assetCode: "ETH",
				conversionAmount: null,
				conversionPoints: null,
				financialAccountId: "reward",
				id: "r",
				initialBalance: "0.000000000000000001",
				kind: "CASHBACK",
			},
			type: "REWARDS",
			updatedAt: "2026-01-01",
			userId: "guest",
			yieldCurrency: null,
		};
		const [result] = calculateFinancialAccountBalances(
			[account],
			[
				{
					amount: "0.000000000000000001",
					currency: "ETH",
					date: "2026-01-02",
					destinationFinancialAccountId: "reward",
				},
			],
			[],
			[],
			new Date("2026-01-03T12:00:00"),
		);
		expect(result?.assets.find(asset => asset.assetCode === "ETH")?.balance).toBe("0.000000000000000002");
	});
	test("swap retains explicit arrival and debits eighteen-place gas separately", () => {
		const assets = replayAccountAssets(
			"wallet",
			[
				{
					amount: "1",
					currency: "BTC",
					destinationAmount: "90000.123456",
					destinationCurrency: "USDC",
					destinationFinancialAccountId: "wallet",
					fees: [{ amount: "0.000000000000000001", assetCode: "ETH", type: "FIXED" }],
					originFinancialAccountId: "wallet",
				},
			],
			[],
			"BRL",
			"2026-01-02",
		);
		expect(assets).toEqual([
			{ assetCode: "BTC", balance: "-1.00000000" },
			{ assetCode: "ETH", balance: "-0.000000000000000001" },
			{ assetCode: "USDC", balance: "90000.123456" },
		]);
	});
	test("retains an eighteen-place crypto unit beside fiat", () => {
		const assets = replayAccountAssets(
			"wallet",
			[
				{
					amount: "0.000000000000000001",
					currency: "ETH",
					date: "2026-01-01",
					destinationFinancialAccountId: "wallet",
				},
				{ amount: 12, currency: "BRL", date: "2026-01-01", destinationFinancialAccountId: "wallet" },
			],
			[],
			"BRL",
			"2026-01-02",
		);
		expect(assets).toEqual([
			{ assetCode: "ETH", balance: "0.000000000000000001" },
			{ assetCode: "BRL", balance: "12.00" },
		]);
	});
	test("checkpoints apply per asset after same-day movements", () => {
		const assets = replayAccountAssets(
			"wallet",
			[
				{ amount: "1", currency: "ETH", date: "2026-01-01", destinationFinancialAccountId: "wallet" },
				{
					amount: "0.000000000000000001",
					currency: "ETH",
					date: "2026-01-02",
					destinationFinancialAccountId: "wallet",
				},
			],
			[{ assetCode: "ETH", balance: "2", date: "2026-01-01" }],
			"BRL",
			"2026-01-02",
		);
		expect(assets).toEqual([{ assetCode: "ETH", balance: "2.000000000000000001" }]);
	});
	test("reads old IDB records without dropping institution benefits", () => {
		const institution = { benefits: [{ kind: "CASHBACK" }], name: "Bank" };
		const account = normalizeAccountAssets({
			balance: 12.5,
			currency: "BRL",
			institution,
			type: "CHECKING",
		});
		expect(account.assets).toEqual([{ assetCode: "BRL", balance: "12.5" }]);
		expect(account.institution).toEqual(institution);
		expect("currency" in account).toBe(false);
		expect("balance" in account).toBe(false);
	});
	test("does not reinterpret missing cross-asset destination amount", () => {
		expect(() =>
			replayAccountAssets(
				"wallet",
				[
					{
						amount: "1",
						currency: "ETH",
						destinationCurrency: "BTC",
						destinationFinancialAccountId: "wallet",
					},
				],
				[],
				"BRL",
				"2026-01-02",
			),
		).toThrow();
	});
});

test("explicit null denomination preserves crypto-only holdings without a synthetic fiat asset", () => {
	const account = normalizeAccountAssets({
		assets: [{ assetCode: "ETH", balance: "0.000000000000000001" }],
		type: "CHECKING",
		yieldCurrency: null,
	});
	expect(account.yieldCurrency).toBeNull();
	expect(account.assets).toEqual([{ assetCode: "ETH", balance: "0.000000000000000001" }]);
	expect(normalizeAccountAssets({ type: "CHECKING", yieldCurrency: null }).assets).toEqual([]);
});

test("daily totals retain all native assets across wallets without quote conversion", () => {
	expect(
		groupAccountAssets([
			{
				assets: [
					{ assetCode: "BRL", balance: "12.30" },
					{ assetCode: "ETH", balance: "0.000000000000000001" },
				],
			},
			{
				assets: [
					{ assetCode: "ETH", balance: "0.000000000000000001" },
					{ assetCode: "BTC", balance: "0.00000001" },
				],
			},
		]),
	).toEqual([
		{ amount: "12.30", currency: "BRL" },
		{ amount: "0.000000000000000002", currency: "ETH" },
		{ amount: "0.00000001", currency: "BTC" },
	]);
});

test("primary currency is the first fiat holding, then card, rewards asset and legacy column", () => {
	expect(
		primaryCurrency({
			assets: [
				{ assetCode: "BTC", balance: "1" },
				{ assetCode: "USD", balance: "1" },
				{ assetCode: "BRL", balance: "1" },
			],
			yieldCurrency: "JPY",
		}),
	).toBe("USD");
	expect(primaryCurrency({ assets: [], creditCard: { currency: "EUR" }, yieldCurrency: "JPY" })).toBe(
		"EUR",
	);
	expect(primaryCurrency({ assets: [], rewardsAccount: { assetCode: "BTC" }, yieldCurrency: "JPY" })).toBe(
		"BTC",
	);
	expect(primaryCurrency({ yieldCurrency: "JPY" })).toBe("JPY");
	expect(primaryCurrency(null)).toBeNull();
});

test("fiat balance reads the primary fiat position", () => {
	expect(
		fiatAccountBalance({
			assets: [
				{ assetCode: "BRL", balance: "10.5" },
				{ assetCode: "USD", balance: "2" },
				{ assetCode: "BTC", balance: "1" },
			],
			yieldCurrency: "BRL",
		}),
	).toBe(10.5);
});
