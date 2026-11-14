import { expect, type Page, test } from "@playwright/test";

const shots = process.env.LOAN_COMPARISON_SCREENSHOTS;
test.describe.configure({ timeout: 180_000 });
const draftKey = "zaimu:tools:loan-comparison:v1";
const loanTerms = {
	charges: [] as { amount: number; financed: boolean; name: string; recurring: boolean }[],
	currency: "BRL",
	discount: "PRESENT_VALUE",
	firstDueDate: "2026-12-15",
	graceInterest: "PAY",
	graceMonths: 0,
	lateFinePercent: 2,
	lateMonthlyPercent: 1,
	principalAmount: 10000,
	startDate: "2026-11-15",
};
const draft = {
	existingLoanIds: [],
	offers: [
		{
			id: "loan-a",
			kind: "LOAN",
			name: "Banco Azul 12x",
			quotedInstallment: null,
			terms: {
				...loanTerms,
				amortization: "PRICE",
				charges: [{ amount: 150, financed: false, name: "TAC", recurring: false }],
				rate: { fixedPeriod: "MONTHLY", fixedRate: 2.1 },
				totalInstallments: 12,
			},
		},
		{
			id: "loan-b",
			kind: "LOAN",
			name: "Cooperativa 24x",
			quotedInstallment: null,
			terms: {
				...loanTerms,
				amortization: "SAC",
				rate: { fixedPeriod: "YEARLY", fixedRate: 22 },
				totalInstallments: 24,
			},
		},
		{
			amount: 10000,
			closingDay: 3,
			currency: "BRL",
			dueDay: 10,
			fee: 0,
			id: "pix-a",
			installments: 12,
			iof: 0,
			kind: "PIX_CREDIT",
			monthlyRate: null,
			name: "Pix no crédito",
			pixDate: "2026-11-15",
			quotedInstallment: 1090,
			quotedTotal: null,
		},
	],
	opportunityRate: 0.9,
	version: 1,
};

async function open(page: Page, baseURL: string, guest: boolean, path = "/tools/loan-comparison") {
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.message));
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.origin === baseURL) return route.continue();
		let data: unknown = [];
		if (url.pathname.includes("get-session")) data = null;
		else if (url.pathname.includes("calendar")) data = { countries: [], coverage: [] };
		else if (url.pathname.endsWith("/reference-rates/indicators"))
			data = { catalog: {}, observations: { CDI: [], IPCA: [], SELIC: [], TR: [] }, projections: [] };
		return route.fulfill({ body: JSON.stringify(data), contentType: "application/json", status: 200 });
	});
	await page.addInitScript(
		([key, value, guestMode]) => {
			if (!sessionStorage.getItem("seeded")) {
				localStorage.setItem(key, value);
				sessionStorage.setItem("seeded", "1");
			}
			if (guestMode === "guest")
				localStorage.setItem(
					"zaimu-auth",
					JSON.stringify({
						state: { guestId: "guest_browser_loans", isGuestMode: true },
						version: 0,
					}),
				);
		},
		[draftKey, JSON.stringify(draft), guest ? "guest" : "public"] as const,
	);
	await page.goto(`${baseURL}${path}`, { waitUntil: "domcontentloaded" });
	await page.getByRole("heading", { name: "Comparar empréstimos" }).waitFor();
	return errors;
}

test("public comparison ranks loans and Pix no crédito without a session", async ({
	page,
	baseURL,
}, info) => {
	const errors = await open(page, baseURL!, false);
	expect(new URL(page.url()).pathname).toBe("/tools/loan-comparison");
	await expect(page.getByRole("link", { exact: true, name: "Entrar" })).toBeVisible();
	await expect(page.getByRole("columnheader", { name: /Banco Azul 12x/ })).toBeVisible();
	await expect(page.getByText("1º lugar")).toBeVisible();
	await expect(page.getByRole("rowheader", { exact: true, name: "CET anual" })).toBeVisible();
	if (shots) await page.screenshot({ fullPage: true, path: `${shots}/public-${info.project.name}.png` });

	await page.getByLabel("Quitar após parcela").fill("6");
	await expect(page.getByRole("rowheader", { name: "Economia na quitação" })).toBeVisible();
	if (shots) await page.screenshot({ fullPage: true, path: `${shots}/payoff-${info.project.name}.png` });

	await page.reload({ waitUntil: "domcontentloaded" });
	await expect(page.getByRole("columnheader", { name: /Cooperativa 24x/ })).toBeVisible();
	expect(errors).toEqual([]);
});

test("share link imports offers into the draft", async ({ page, baseURL }) => {
	const offers = draft.offers.slice(0, 1);
	const payload = Buffer.from(JSON.stringify({ o: offers, v: 1 })).toString("base64url");
	await open(page, baseURL!, false, `/tools/loan-comparison?offers=${payload}`);
	await expect(page.getByRole("columnheader", { name: /Banco Azul 12x/ })).toBeVisible();
	await expect(page.getByRole("columnheader", { name: /Pix no crédito/ })).toHaveCount(0);
	await expect.poll(() => new URL(page.url()).searchParams.has("offers")).toBe(false);
});

test("guest session renders the comparison inside the app shell", async ({ page, baseURL }, info) => {
	const errors = await open(page, baseURL!, true);
	await expect(page.getByRole("link", { exact: true, name: "Entrar" })).toHaveCount(0);
	await expect(page.getByRole("columnheader", { name: /Pix no crédito/ })).toBeVisible();
	if (shots) await page.screenshot({ fullPage: true, path: `${shots}/guest-${info.project.name}.png` });
	expect(errors).toEqual([]);
});
