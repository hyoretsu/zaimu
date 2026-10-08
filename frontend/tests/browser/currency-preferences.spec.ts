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
