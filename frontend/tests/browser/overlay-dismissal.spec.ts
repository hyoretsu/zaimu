import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
	await page.route("**/*", route =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
	);
	await page.goto("/tests/browser/fixtures/overlay-dismissal.html");
});

test("conditionally mounted purchase editor stays open under StrictMode and closes on navigation", async ({
	page,
}) => {
	await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
	await page
		.getByRole("dialog", { exact: true, name: "Invoice" })
		.getByRole("button", { name: "Edit purchase" })
		.click();
	const editor = page.getByRole("dialog", { exact: true, name: "Edit purchase" });
	await expect(editor).toBeVisible();
	await expect(page.getByRole("dialog", { exact: true, includeHidden: true, name: "Invoice" })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Navigate" }).click({ force: true });
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Navigate" }).click();
	await expect(page.getByRole("dialog")).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
	await page.getByRole("button", { exact: true, name: "Edit purchase" }).click();
	await expect(editor).toBeVisible();
});

test("actions close when switching screens and can open again after returning", async ({ page }) => {
	await page.getByRole("button", { exact: true, name: "Open actions" }).click();
	await expect(page.getByText("Screen actions", { exact: true })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Navigate" }).click({ force: true });
	await expect(page.getByText("Screen actions", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Navigate" }).click();
	await expect(page.getByText("Screen actions", { exact: true })).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Open actions" }).click();
	await expect(page.getByText("Screen actions", { exact: true })).toBeVisible();
});

test("mobile action portal disappears on navigation with production animations", async ({ page }) => {
	await page.getByRole("button", { exact: true, name: "Ações da tela" }).click();
	await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Navigate" }).click({ force: true });
	await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Navigate" }).click();
	await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Ações da tela" }).click();
	await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toBeVisible();
});
