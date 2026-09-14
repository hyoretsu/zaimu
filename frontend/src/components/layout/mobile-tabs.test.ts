import { describe, expect, test } from "bun:test";
import {
	createMobileTabRoutes,
	type MobileRoute,
	type MobileTabId,
	mobileTabIds,
	mobileTabRoots,
	resolveMobileRoute,
	resolveMobileTabDestination,
	updateMobileTabRoute,
} from "./mobile-tabs";

describe("mobile tab routes", () => {
	test.each<readonly [string, MobileRoute["tabId"], MobileRoute["screenPath"]]>([
		["/", "overview", "/"],
		["/transactions", "transactions", "/transactions"],
		["/accounts", "accounts", "/accounts"],
		["/credit-cards", "creditCards", "/credit-cards"],
		["/more", "more", "/more"],
		["/debts", "more", "/debts"],
		["/loans", "more", "/loans"],
		["/recurring", "more", "/recurring"],
		["/settings", "more", "/settings"],
		["/salaries", "more", "/recurring"],
		["/subscriptions", "more", "/recurring"],
	])("classifies %s", (pathname, tabId, screenPath) => {
		expect(resolveMobileRoute(pathname)).toEqual({ screenPath, tabId });
	});

	test("rejects public and unknown routes", () => {
		expect(resolveMobileRoute("/auth")).toBeNull();
		expect(resolveMobileRoute("/unknown")).toBeNull();
	});

	test("starts every unvisited tab at its root", () => {
		expect(createMobileTabRoutes("/transactions")).toEqual(mobileTabRoots);
	});

	test.each<readonly [MobileTabId]>(mobileTabIds.map(tabId => [tabId] as const))(
		"returns the root when reselecting %s",
		tabId => {
			expect(resolveMobileTabDestination({ ...mobileTabRoots, more: "/recurring" }, tabId, tabId)).toBe(
				mobileTabRoots[tabId],
			);
		},
	);

	test("preserves the remembered screen when selecting an inactive tab", () => {
		const routes = { ...mobileTabRoots, more: "/recurring" } as const;
		expect(resolveMobileTabDestination(routes, "transactions", "more")).toBe("/recurring");
	});

	test("remembers only the current screen for each tab", () => {
		const withDebts = updateMobileTabRoute(mobileTabRoots, "/debts");
		const withLoans = updateMobileTabRoute(withDebts, "/loans");
		const withTransactions = updateMobileTabRoute(withLoans, "/transactions");

		expect(withTransactions).toEqual({ ...mobileTabRoots, more: "/loans" });
		expect(withLoans).not.toBe(withDebts);
		expect(updateMobileTabRoute(withTransactions, "/transactions")).toBe(withTransactions);
	});
});
