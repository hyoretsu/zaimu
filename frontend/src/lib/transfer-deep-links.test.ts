import { expect, test } from "bun:test";
import { parseTransferDeepLink } from "./transfer-deep-links";
test("transfer links select review and never execute acceptance", () => {
	expect(parseTransferDeepLink("zaimu://account-transfers?transfer=abc-123")).toEqual({ id: "abc-123" });
	expect(parseTransferDeepLink("https://zaimu.app/account-transfers/?transfer=abc")).toEqual({ id: "abc" });
	expect(parseTransferDeepLink("https://zaimu.app/account-transfers/accept?transfer=abc")).toBeNull();
	expect(parseTransferDeepLink("javascript:alert(1)")).toBeNull();
	expect(parseTransferDeepLink("https://zaimu.app/account-transfers?transfer=../abc")).toBeNull();
});
