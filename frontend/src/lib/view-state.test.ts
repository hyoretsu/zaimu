import { describe, expect, test } from "bun:test";
import { createMemoryHistory, createRootRoute, createRouter } from "@tanstack/react-router";
import { z } from "zod";
import {
	initialTransactionFilters,
	transactionFilterParameters,
	transactionFiltersSchema,
} from "@/routes/transactions/-transaction-filters";
import { createDialogHistory } from "./dialog-history";
import {
	parseViewSearch,
	readViewState,
	stringifyViewSearch,
	viewBoolean,
	viewChartParameters,
	viewChartPeriod,
	viewDateRange,
	viewDateRangeParameters,
	viewMonth,
	viewString,
	viewStringList,
	writeViewState,
} from "./view-state";

function routerRoundTrip(href: string) {
	const url = new URL(href, "http://localhost");
	return url.pathname + stringifyViewSearch(parseViewSearch(url.search)) + url.hash;
}

describe("plain URL view parameters", () => {
	test("one active transaction filter produces exactly one plain parameter", () => {
		const href = writeViewState(
			"/transactions",
			"filters",
			{ ...initialTransactionFilters, accountId: "account-123" },
			initialTransactionFilters,
			transactionFilterParameters,
		);
		expect(href).toBe("/transactions?account=account-123");
		expect(
			readViewState(
				href,
				"filters",
				initialTransactionFilters,
				transactionFiltersSchema,
				transactionFilterParameters,
			),
		).toEqual({ ...initialTransactionFilters, accountId: "account-123" });
	});
	test("all transaction fields are flat and defaults stay absent", () => {
		const value = {
			...initialTransactionFilters,
			accountId: "a",
			categoryId: "c",
			dateRange: { endDate: "2026-10-31", startDate: "2026-10-01" },
			search: "café",
			source: "CREDIT_CARD" as const,
			type: "EXPENSE" as const,
			visibility: "hidden" as const,
		};
		const href = routerRoundTrip(
			writeViewState(
				"/transactions?existing=keep#list",
				"filters",
				value,
				initialTransactionFilters,
				transactionFilterParameters,
			),
		);
		expect(href).toBe(
			"/transactions?existing=keep&account=a&category=c&startDate=2026-10-01&endDate=2026-10-31&search=caf%C3%A9&source=CREDIT_CARD&type=EXPENSE&visibility=hidden#list",
		);
		expect(
			readViewState(
				href,
				"filters",
				initialTransactionFilters,
				transactionFiltersSchema,
				transactionFilterParameters,
			),
		).toEqual(value);
		expect(
			writeViewState(
				href,
				"filters",
				initialTransactionFilters,
				initialTransactionFilters,
				transactionFilterParameters,
			),
		).toBe("/transactions?existing=keep#list");
	});
	for (const value of [
		"Conta Inter",
		"false",
		"123",
		"null",
		'"quoted"',
		'{"text":"test"}',
		"",
		"R$ 1.234,56 & café / #?",
	]) {
		test(`preserves literal search text ${value}`, () => {
			const href = routerRoundTrip(writeViewState("/admin/users", "search", value, "default"));
			expect(readViewState(href, "search", "default", viewString)).toBe(value || "default");
		});
	}
	test("dashboard and history periods use simple dates, including open boundaries", () => {
		const fallback = { endDate: "2026-10-26", startDate: "2026-10-26" };
		const value = { endDate: "2026-09-30", startDate: "2026-09-01" };
		for (const path of ["/", "/admin/history"]) {
			const href = writeViewState(path, "range", value, fallback, viewDateRangeParameters);
			expect(href).toBe(`${path}?startDate=2026-09-01&endDate=2026-09-30`);
			expect(readViewState(href, "range", fallback, viewDateRange, viewDateRangeParameters)).toEqual(
				value,
			);
			expect(
				readViewState(
					`${path}?endDate=2026-09-30`,
					"range",
					fallback,
					viewDateRange,
					viewDateRangeParameters,
				),
			).toEqual({ endDate: "2026-09-30", startDate: undefined });
		}
	});
	test("comparison chart uses flat dates and counts without replacing dashboard range", () => {
		const fallback = {
			endDate: "2026-10-31",
			periodsAfter: 10,
			periodsBefore: 1,
			startDate: "2026-10-01",
		};
		const value = { ...fallback, periodsBefore: 2, startDate: "2026-09-01" };
		const href = writeViewState("/?startDate=2026-01-01", "chart", value, fallback, viewChartParameters);
		expect(href).toBe("/?startDate=2026-01-01&chartStart=2026-09-01&before=2");
		expect(
			readViewState(routerRoundTrip(href), "chart", fallback, viewChartPeriod, viewChartParameters),
		).toEqual(value);
	});
	test("months, directions, admin selectors and statement IDs stay scalar", () => {
		for (const [path, key, value, fallback] of [
			["/budget", "month", "2026-11", "2026-10"],
			["/recurring", "type", "INCOME", "all"],
			["/admin/history", "kind", "CURRENCY", "INTEREST"],
			["/admin/history", "rate", "SELIC", "CDI"],
			["/admin/history", "currency", "USD", "BRL"],
			["/credit-cards", "statement", "statement-123", null],
		] as const) {
			const href = writeViewState<string | null>(path, key, value, fallback);
			expect(href).toBe(`${path}?${key}=${value}`);
			expect(
				readViewState<string | null>(routerRoundTrip(href), key, fallback, z.string().nullable()),
			).toBe(value);
		}
	});
	test("booleans, numeric windows and repeated disclosures stay plain", () => {
		expect(writeViewState("/loans", "paid", true, false)).toBe("/loans?paid=true");
		expect(readViewState("/loans?paid=true", "paid", false, viewBoolean)).toBe(true);
		const href = routerRoundTrip(writeViewState("/recurring", "sections", ["paused", "ended"], []));
		expect(href).toBe("/recurring?sections=paused&sections=ended");
		expect(readViewState(href, "sections", [], viewStringList)).toEqual(["paused", "ended"]);
		const fields = [
			{ parameter: "next", path: "next" },
			{ parameter: "previous", path: "previous" },
		];
		const window = { next: 6, previous: 0 };
		const url = writeViewState("/credit-cards", "window", window, { next: 0, previous: 0 }, fields);
		expect(url).toBe("/credit-cards?next=6");
		expect(
			readViewState(
				url,
				"window",
				{ next: 0, previous: 0 },
				z.object({ next: z.number(), previous: z.number() }),
				fields,
			),
		).toEqual(window);
	});
	test("invalid values fall back; object values require explicit field mappings", () => {
		for (const raw of ["{", "null", "2026-13", "invalid"])
			expect(
				readViewState(`/budget?month=${encodeURIComponent(raw)}`, "month", "2026-10", viewMonth),
			).toBe("2026-10");
		expect(readViewState("/loans?paid=invalid", "paid", false, viewBoolean)).toBe(false);
		expect(viewDateRange.safeParse({ startDate: "2026-02-30" }).success).toBe(false);
		expect(() => writeViewState("/", "filters", { account: "id" }, {})).toThrow("Missing field mapping");
	});
	test("router encoding and history replacement preserve dialog without adding steps", async () => {
		const history = createMemoryHistory({ initialEntries: ["/previous", "/"] });
		const router = createRouter({
			history,
			parseSearch: parseViewSearch,
			routeTree: createRootRoute(),
			stringifySearch: stringifyViewSearch,
		});
		const dialogs = createDialogHistory(history);
		let closed = false;
		dialogs.retain("modal", () => {
			closed = true;
		});
		const length = history.length;
		for (const value of ["first", "false", '"quoted"']) {
			const nextHref = writeViewState(history.location.href, "search", value, "");
			const search = parseViewSearch(new URL(nextHref, "http://localhost").search);
			const location = router.buildLocation({ search, to: "/" });
			history.replace(location.href, { ...history.location.state });
			expect(history.length).toBe(length);
			expect(readViewState(history.location.href, "search", "", viewString)).toBe(value);
			expect(closed).toBe(false);
		}
		dialogs.release("modal");
		await Promise.resolve();
		expect(history.location.href).toBe("/");
		history.back();
		expect(history.location.href).toBe("/previous");
	});
});
