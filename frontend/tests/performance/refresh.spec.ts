import { expect, test } from "@playwright/test";

test("persisted save remains confirmed and existing cards survive failed derived refetch", async ({
	page,
	baseURL,
}) => {
	const api = "http://127.0.0.1:3335";
	await page.route("**/*", route => {
		const url = new URL(route.request().url());
		if (url.origin === api || url.origin === baseURL) return route.continue();
		if (url.hostname === "ipapi.co") return route.fulfill({ json: { country_code: "BR" } });
		return route.abort("blockedbyclient");
	});
	const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
		data: { email: "performance0@zaimu.local", password: "Performance-local-2026" },
		headers: { origin: baseURL! },
	});
	expect(login.ok()).toBeTruthy();
	expect(login.headers()["x-performance-namespace"]).toBe("zaimu_performance");
	await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-03:00"));
	await page.goto("/credit-cards");
	const existing = page.getByRole("heading", { exact: true, name: "Cartão 01" });
	await expect(existing).toBeVisible();
	await page.route(`${api}/credit-cards`, route =>
		route.fulfill({ json: { message: "Local controlled read failure" }, status: 500 }),
	);
	await page.getByRole("button", { exact: true, name: "Nova compra" }).first().click();
	const dialog = page.getByRole("dialog");
	await dialog.getByRole("combobox", { exact: true, name: "Cartão" }).click();
	await page.getByRole("option").first().click();
	await dialog.getByLabel("Descrição", { exact: true }).fill("Performance refresh failure");
	await dialog.getByLabel(/Valor da compra/).fill("12,34");
	const mutation = page.waitForResponse(
		response =>
			response.request().method() === "POST" &&
			/\/credit-cards\/[^/]+\/purchases$/.test(new URL(response.url()).pathname),
	);
	await dialog.getByRole("button", { exact: true, name: "Salvar compra" }).click();
	const saved = await mutation;
	const rows = (await saved.json()) as { id: string; purchaseId: string }[];
	try {
		expect(saved.ok()).toBeTruthy();
		await expect(
			page.getByText("Compra registrada e faturas recalculadas.", { exact: true }).last(),
		).toBeVisible();
		await expect(
			page.getByText("Atualização falhou. Dados anteriores continuam disponíveis.", { exact: true }),
		).toBeVisible({ timeout: 30000 });
		await expect(existing).toBeVisible();
		await page.unroute(`${api}/credit-cards`);
		await page.getByRole("button", { exact: true, name: "Tentar novamente" }).click();
		await expect(
			page.getByText("Atualização falhou. Dados anteriores continuam disponíveis.", { exact: true }),
		).toHaveCount(0);
	} finally {
		const deleted = await page.request.delete(`${saved.url()}/${rows[0]!.purchaseId ?? rows[0]!.id}`);
		expect(deleted.ok()).toBeTruthy();
	}
});
