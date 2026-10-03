import { afterEach, expect, test } from "bun:test";
import { decryptCredentials, encryptCredentials, openFinanceAvailable } from "./credentials";

const previous = process.env.OPEN_FINANCE_ENCRYPTION_KEY;
afterEach(() => {
	if (previous === undefined) delete process.env.OPEN_FINANCE_ENCRYPTION_KEY;
	else process.env.OPEN_FINANCE_ENCRYPTION_KEY = previous;
});
test("credentials use authenticated encryption bound to owner", () => {
	process.env.OPEN_FINANCE_ENCRYPTION_KEY = "ab".repeat(32);
	const input = { clientId: "client", clientSecret: "secret" };
	const encrypted = encryptCredentials("owner", input);
	expect(encrypted).not.toContain("secret");
	expect(decryptCredentials("owner", encrypted)).toEqual(input);
	expect(() => decryptCredentials("other", encrypted)).toThrow();
	expect(() => decryptCredentials("owner", encrypted.slice(0, -3))).toThrow();
	expect(encryptCredentials("owner", input)).not.toBe(encrypted);
});
test("missing or malformed key disables integration", () => {
	delete process.env.OPEN_FINANCE_ENCRYPTION_KEY;
	expect(openFinanceAvailable()).toBe(false);
	process.env.OPEN_FINANCE_ENCRYPTION_KEY = "bad";
	expect(openFinanceAvailable()).toBe(false);
});
