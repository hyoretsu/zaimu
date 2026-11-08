import { expect, test } from "bun:test";
import { syncTaxSettings } from "./sync-tax-settings";

test("omitted tax arrays and per-tax modes preserve existing settings", () => {
	expect(
		syncTaxSettings({}, { yieldTaxIds: ["ir", "iof"], yieldTaxModes: { ir: "ON_REDEMPTION" } }),
	).toEqual({ yieldTaxIds: ["ir", "iof"], yieldTaxModes: { ir: "ON_REDEMPTION" } });
});
test("explicit empty or null tax settings clear rather than preserve", () => {
	const existing = { yieldTaxIds: ["ir"], yieldTaxModes: { ir: "DAILY" } };
	expect(syncTaxSettings({ yieldTaxIds: [], yieldTaxModes: {} }, existing)).toEqual({
		yieldTaxIds: [],
		yieldTaxModes: {},
	});
	expect(syncTaxSettings({ yieldTaxIds: null, yieldTaxModes: null }, existing)).toEqual({
		yieldTaxIds: [],
		yieldTaxModes: null,
	});
	expect(syncTaxSettings({})).toEqual({ yieldTaxIds: [], yieldTaxModes: null });
});
