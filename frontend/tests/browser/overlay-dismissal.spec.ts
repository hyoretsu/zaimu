import { expect, test } from "@playwright/test";

test.beforeEach(async ({ page, baseURL }) => {
	await page.route("**/*", route =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
	);
	await page.goto("/tests/browser/fixtures/overlay-dismissal.html");
});

test("mobile actions open a dialog that stays open after the menu closes", async ({ page }) => {
	await page.getByRole("button", { exact: true, name: "Ações da tela" }).click();
	await page.getByRole("button", { exact: true, name: "New purchase" }).click();
	const dialog = page.getByRole("dialog", { exact: true, name: "Invoice" });
	await expect(dialog).toBeVisible();
	await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toHaveCount(0);
	await expect(dialog).toBeVisible();
	await dialog.getByRole("button", { name: "Fechar" }).click();
	await expect(dialog).toHaveCount(0);
	await page.getByRole("button", { exact: true, name: "Ações da tela" }).click();
	await page.getByRole("button", { exact: true, name: "New purchase" }).click();
	await expect(dialog).toBeVisible();
});

test("keyboard action keeps focus inside the opened dialog", async ({ page }) => {
	const trigger = page.getByRole("button", { exact: true, name: "Ações da tela" });
	await trigger.focus();
	await page.keyboard.press("Enter");
	await page.getByRole("button", { exact: true, name: "New purchase" }).focus();
	await page.keyboard.press("Enter");
	const dialog = page.getByRole("dialog", { exact: true, name: "Invoice" });
	await expect(dialog).toBeVisible();
	await expect(dialog.getByRole("button", { name: "Edit purchase" })).toBeFocused();
});

test.describe("touch actions", () => {
	test.use({ hasTouch: true });
	test("menu hands focus to the opened dialog", async ({ page }) => {
		await page.getByRole("button", { exact: true, name: "Ações da tela" }).tap();
		await page.getByRole("button", { exact: true, name: "New purchase" }).tap();
		await expect(page.getByRole("dialog", { exact: true, name: "Invoice" })).toBeVisible();
		await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toHaveCount(0);
		await expect(page.getByRole("dialog", { exact: true, name: "Invoice" })).toBeVisible();
	});
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
