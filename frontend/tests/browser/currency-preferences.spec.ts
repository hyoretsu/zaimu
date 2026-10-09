import { expect, test } from "@playwright/test";

test("guest location, travel confirmation, persisted preference and direct mobile inheritance", async ({
	page,
	baseURL,
}) => {
	const TARGET_URL = baseURL!;

	const errors: string[] = [];
	page.on("pageerror", e => errors.push(e.message));
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.origin === TARGET_URL) return route.continue();
		let data: unknown = [];
		if (url.hostname === "ipapi.co") data = { country_code: "JP" };
		else if (url.pathname.includes("get-session")) data = null;
		else if (url.pathname.endsWith("/currencies")) data = ["USD", "BRL", "JPY", "KWD"];
		return route.fulfill({ body: JSON.stringify(data), contentType: "application/json", status: 200 });
	});
	await page.addInitScript(() =>
		localStorage.setItem(
			"zaimu-auth",
			JSON.stringify({ state: { guestId: "guest_browser_currency", isGuestMode: true }, version: 0 }),
		),
	);
	await page.goto(`${TARGET_URL}/settings`);
	await page.getByText("Moeda padrão", { exact: true }).first().waitFor();
	await expect(
		page.getByText("Moeda usada em novos cadastros e totais: JPY.", { exact: false }),
	).toBeVisible();
	await page.getByRole("combobox", { exact: true, name: "Moeda padrão" }).click();
	await page.getByRole("option", { name: /BRL/ }).click();
	await expect(
		page.getByText("Moeda usada em novos cadastros e totais: BRL.", { exact: false }),
	).toBeVisible();
	await page.getByRole("link", { exact: true, name: "Visão geral" }).click();
	await page.getByRole("button", { exact: true, name: "Trocar moeda" }).click();
	await page.getByRole("button", { exact: true, name: "Cancelar" }).click();
	await expect(page.getByText("Sua preferência está em BRL.", { exact: false })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Trocar moeda" }).click();
	await page.getByRole("button", { exact: true, name: "Confirmar troca" }).click();
	await page.goto(`${TARGET_URL}/settings`);
	await expect(
		page.getByText("Moeda usada em novos cadastros e totais: JPY.", { exact: false }),
	).toBeVisible();

	await page.setViewportSize({ height: 844, width: 390 });
	await page.goto(`${TARGET_URL}/debts`);
	await page.getByText("Nenhuma dívida cadastrada", { exact: true }).waitFor();
	await page.getByRole("button", { name: "Adicionar lançamento" }).click();
	await page.getByRole("dialog").waitFor();

	await expect(page.getByRole("combobox", { exact: true, name: "Moeda" })).toContainText("JPY", {
		timeout: 30000,
	});

	expect(errors).toEqual([]);
});

test("empty loan follows delayed detection and an entered principal keeps its denomination", async ({
	page,
	baseURL,
}) => {
	let release!: () => void;
	const detection = new Promise<void>(resolve => {
		release = resolve;
	});
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.origin === baseURL) return route.continue();
		let data: unknown = [];
		if (url.hostname === "ipapi.co") {
			await detection;
			data = { country_code: "JP" };
		} else if (url.pathname.includes("get-session")) data = null;
		else if (url.pathname.endsWith("/currencies")) data = ["USD", "BRL", "JPY", "KWD"];
		return route.fulfill({ body: JSON.stringify(data), contentType: "application/json", status: 200 });
	});
	await page.addInitScript(() =>
		localStorage.setItem(
			"zaimu-auth",
			JSON.stringify({ state: { guestId: "guest_currency_delayed", isGuestMode: true }, version: 0 }),
		),
	);
	await page.goto(`${baseURL}/loans`, { waitUntil: "domcontentloaded" });
	await page.getByRole("button", { exact: true, name: "Adicionar" }).click();
	const currency = page.getByRole("combobox", { exact: true, name: "Moeda" });
	await expect(currency).toContainText("USD");
	release();
	await expect(currency).toContainText("JPY");
	await page.locator("input[name=principalAmount]").fill("123");
	await expect(page.locator("input[name=principalAmount]")).toHaveValue("JPY 123");
	await currency.click();
	await page.getByRole("option", { name: /KWD/ }).click();
	await expect(currency).toContainText("KWD");
	await page.locator("input[name=principalAmount]").fill("123,456");
	await expect(page.locator("input[name=principalAmount]")).toHaveValue("KWD 123,456");
});

test("dashboard waits for BRL preference instead of issuing provisional USD demand", async ({
	page,
	baseURL,
}) => {
	let release!: () => void;
	let preferenceRequested!: () => void;
	const preferenceSeen = new Promise<void>(resolve => {
		preferenceRequested = resolve;
	});
	const preference = new Promise<void>(resolve => {
		release = resolve;
	});
	const requests: { path: string; currency?: string }[] = [];
	const historyRequests: string[] = [];
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", async route => {
		const url = new URL(route.request().url());
		if (url.origin === baseURL) return route.continue();
		let data: unknown = [];
		if (url.pathname.includes("get-session"))
			data = {
				session: { expiresAt: "2099-01-01T00:00:00Z", id: "session", userId: "currency_owner" },
				user: { email: "currency@example.test", emailVerified: true, id: "currency_owner", name: "Teste" },
			};
		else if (url.pathname.startsWith("/currency-preferences")) {
			preferenceRequested();
			await preference;
			data = { preferredCurrency: "BRL" };
		} else if (url.hostname === "ipapi.co") data = { country_code: "BR" };
		else if (url.pathname.endsWith("/currencies")) data = ["USD", "BRL"];
		else if (url.pathname.startsWith("/dashboard")) {
			requests.push({ currency: route.request().headers()["x-currency"], path: url.pathname });
			data = url.pathname.includes("comparison")
				? []
				: {
						accounts: [],
						consolidation: { forecastAvailable: true, histories: [], publishedDates: {}, unavailable: false },
						creditCards: [],
						currency: "BRL",
						forecasts: [],
						referenceRatesAvailable: true,
						totalAvailableCredit: 0,
					};
		} else if (url.pathname.includes("financial-history") && !url.pathname.endsWith("/currencies"))
			historyRequests.push(url.pathname);
		await route.fulfill({ body: JSON.stringify(data), contentType: "application/json", status: 200 });
	});
	await page.goto(`${baseURL}/`, { waitUntil: "domcontentloaded" });
	await preferenceSeen;
	// Give the mounted query observers time to attempt their initial fetch.
	await page.waitForTimeout(500);
	expect(requests).toEqual([]);
	expect(historyRequests).toEqual([]);
	release();
	await expect(page.getByText("Evolução por período", { exact: true })).toBeVisible();
	await expect.poll(() => requests.some(row => row.path.includes("comparison"))).toBe(true);
	expect(requests.length).toBeGreaterThanOrEqual(2);
	expect(requests.every(row => row.currency === "BRL")).toBe(true);
	expect(historyRequests).toEqual([]);
});

test("currency names follow Portuguese and reopening scrolls to selection", async ({ page, baseURL }) => {
	await page.setViewportSize({ height: 844, width: 390 });
	await page.routeWebSocket("**", socket => socket.close());
	await page.route("**/*", route => {
		const url = new URL(route.request().url());
		if (url.origin === baseURL) return route.continue();
		const data = url.pathname.endsWith("/currencies")
			? Intl.supportedValuesOf("currency")
			: url.hostname === "ipapi.co"
				? { country_code: "BR" }
				: null;
		return route.fulfill({ body: JSON.stringify(data), contentType: "application/json" });
	});
	await page.addInitScript(() => {
		Object.defineProperty(navigator, "languages", { value: ["en-US"] });
		localStorage.setItem(
			"zaimu-auth",
			JSON.stringify({ state: { guestId: "guest_currency_selector", isGuestMode: true }, version: 0 }),
		);
	});
	await page.goto(`${baseURL}/settings`);
	const select = page.getByRole("combobox", { exact: true, name: "Moeda padrão" });
	await select.click();
	await expect(page.getByRole("option", { exact: true, name: "BRL - Real brasileiro" })).toBeAttached();
	await page.getByRole("textbox", { exact: true, name: "Buscar moeda padrão" }).fill("USD");
	await page.getByRole("option", { exact: true, name: "USD - Dólar americano" }).click();
	await expect(select).toBeEnabled();
	await select.click();
	const selected = page.getByRole("option", { exact: true, name: "USD - Dólar americano" });
	await expect(selected).toHaveAttribute("aria-selected", "true");
	await expect
		.poll(() =>
			selected.evaluate(element => {
				const viewport = element.closest('[data-slot="scroll-area-viewport"]')!;
				const bounds = viewport.getBoundingClientRect();
				const option = element.getBoundingClientRect();
				return option.top >= bounds.top && option.bottom <= bounds.bottom && viewport.scrollTop > 0;
			}),
		)
		.toBe(true);
});
