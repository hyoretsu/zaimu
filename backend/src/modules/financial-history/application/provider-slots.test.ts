import { afterEach, expect, test } from "bun:test";
import { providerSlotKey } from "./provider-slots";

const originalNamespace = process.env.SERVICE_NAMESPACE;
afterEach(() => {
	if (originalNamespace === undefined) delete process.env.SERVICE_NAMESPACE;
	else process.env.SERVICE_NAMESPACE = originalNamespace;
});

test("short provider slot keys preserve existing leases", () => {
	process.env.SERVICE_NAMESPACE = "zaimu";
	expect(providerSlotKey("currency-api")).toBe("zaimu:currency-api");
});

test("long provider keys fit varchar(40) and preserve namespace isolation", () => {
	process.env.SERVICE_NAMESPACE = `zaimu_test_${"a".repeat(32)}`;
	const first = providerSlotKey("currency-api");
	expect(first).toHaveLength(40);
	expect(providerSlotKey("currency-api")).toBe(first);
	expect(providerSlotKey("other-provider")).not.toBe(first);
	process.env.SERVICE_NAMESPACE = `zaimu_test_${"b".repeat(32)}`;
	expect(providerSlotKey("currency-api")).not.toBe(first);
});
