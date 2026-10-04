import { expect, test } from "bun:test";
import { accountDefaultEligibility } from "./account-default-eligibility";

test.each(["CHECKING", "CASH"])("%s supports both defaults", type => {
	expect(accountDefaultEligibility(type, false)).toEqual({ primary: true, statements: true });
});
test.each(["SAVINGS", "INVESTMENT"])("%s supports only statement payments", type => {
	expect(accountDefaultEligibility(type, false)).toEqual({ primary: false, statements: true });
});
test.each(["REWARDS", "CREDIT_CARD"])("%s cannot fund default payments", type => {
	expect(accountDefaultEligibility(type, false)).toEqual({ primary: false, statements: false });
});
test.each(["CHECKING", "CASH", "SAVINGS", "INVESTMENT"])("hidden %s cannot be a default", type => {
	expect(accountDefaultEligibility(type, true)).toEqual({ primary: false, statements: false });
});
