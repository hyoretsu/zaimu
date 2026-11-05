import { describe, expect, test } from "bun:test";
import { addAssetAmounts, decimalToUnits, formatAsset, unitsToDecimal } from "./asset-amount";
import { cryptoAsset, cryptoAssets, cryptoCurrencyCode, registerCryptoAssets } from "./crypto-assets";
import { currencyDigits, isCryptoAsset, normalizeCurrency } from "./money";

describe("crypto assets", () => {
	test("accepts long asset codes and rejects invalid ones", () => {
		expect(normalizeCurrency(" usdc ")).toBe("USDC");
		expect(() => normalizeCurrency("A")).toThrow();
		expect(() => normalizeCurrency("BT C")).toThrow();
	});

	test("resolves catalog precision and distinguishes fiat from crypto", () => {
		expect([
			currencyDigits("BTC"),
			currencyDigits("ETH"),
			currencyDigits("USDC"),
			currencyDigits("BRL"),
		]).toEqual([8, 18, 6, 2]);
		expect([
			isCryptoAsset("BTC"),
			isCryptoAsset("USDC"),
			isCryptoAsset("BRL"),
			isCryptoAsset("USD"),
		]).toEqual([true, true, false, false]);
	});

	test("catalog retains 413 provider identities without downgrading native precision", () => {
		expect(cryptoAssets).toHaveLength(413);
		expect(cryptoAsset("ETH")?.digits).toBe(18);
		expect(cryptoAsset("ETH")?.nativeDigits).toBe(8);
		for (const symbol of ["T", "G", "S", "W", "O"]) {
			const asset = cryptoAsset(cryptoCurrencyCode(symbol));
			expect(asset?.providerId).toBe(symbol);
			expect(asset?.code).toMatch(/^[A-Z0-9]{2,12}$/);
		}
		const eth = cryptoAsset("ETH");
		if (!eth) throw new Error("Missing ETH catalog identity");
		expect(() => registerCryptoAssets([{ ...eth, assetId: "different-provider-identity" }])).toThrow(
			"ambígua",
		);
		expect(cryptoAsset("ETH")).toBe(eth);
		expect(cryptoAsset("MELI")).toBeUndefined();
		expect(cryptoAsset("MUSD")).toBeUndefined();
	});

	test("keeps 18 decimals exact without floating point", () => {
		expect(decimalToUnits("1.000000000000000001", "ETH")).toBe(1000000000000000001n);
		expect(unitsToDecimal(1000000000000000001n, "ETH")).toBe("1.000000000000000001");
		expect(addAssetAmounts(["0.1", "0.2"], "ETH")).toBe("0.300000000000000000");
		expect(unitsToDecimal(-1234n, "BTC")).toBe("-0.00001234");
		expect(() => decimalToUnits("0.123456789", "BTC")).toThrow();
	});

	test("formats gas fees and arrival amounts in their own asset", () => {
		expect(formatAsset("0.00001234", "BTC", { locale: "pt-BR" })).toBe("0,00001234 BTC");
		expect(formatAsset("1234.5", "USDC", { locale: "en-US" })).toBe("1,234.5 USDC");
		expect(formatAsset("-0.002", "ETH", { locale: "pt-BR" })).toBe("-0,002 ETH");
		expect(formatAsset(10, "BRL", { locale: "pt-BR" })).toContain("10,00");
	});
});
