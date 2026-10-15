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
	test("switching cached screens leaves only the active floating action clickable", async ({ page }) => {
		const navigate = page.getByRole("button", { exact: true, name: "Navigate" });
		for (let visit = 1; visit <= 3; visit++) {
			await navigate.tap();
			await expect(
				page.getByRole("button", { exact: true, includeHidden: true, name: "Ações da tela" }),
			).toHaveCount(0);
			await page.getByRole("button", { exact: true, name: "Adicionar" }).tap();
			await expect(page.getByText(`Added: ${visit}`, { exact: true })).toBeVisible();
			await navigate.tap();
			await expect(
				page.getByRole("button", { exact: true, includeHidden: true, name: "Adicionar" }),
			).toHaveCount(0);
			await page.getByRole("button", { exact: true, name: "Ações da tela" }).tap();
			await expect(page.getByRole("button", { exact: true, name: "New purchase" })).toBeVisible();
			await page.keyboard.press("Escape");
		}
	});
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

test("selectors and calendar stay clickable above nested dialogs", async ({ page }) => {
	await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
	await page.getByRole("button", { exact: true, name: "Edit purchase" }).click();
	const editor = page
		.locator('[data-slot="dialog-content"]')
		.filter({ has: page.getByRole("heading", { exact: true, name: "Edit purchase" }) });
	await editor.getByRole("combobox", { exact: true, name: "Categoria" }).click();
	await page.getByRole("option", { exact: true, name: "Mercado" }).click();
	await expect(editor.getByRole("combobox", { exact: true, name: "Categoria" })).toContainText("Mercado");
	await editor.getByRole("combobox", { name: "Moeda" }).click();
	await page.getByRole("option", { exact: true, name: "Real" }).click();
	await expect(editor.getByRole("combobox", { name: "Moeda" })).toContainText("Real");
	await editor.getByRole("button", { name: "Início" }).click();
	await page.getByRole("button", { name: "Próximo mês" }).click();
	await page.keyboard.press("Escape");
	await expect(editor).toBeVisible();
});

for (const width of [390, 1280]) {
	test(`dialogs preserve background scroll and layout at ${width}px`, async ({ page }) => {
		await page.setViewportSize({ height: 844, width });
		await page.evaluate(() => {
			document.body.style.minHeight = "3000px";
			document.body.style.minWidth = "1800px";
			const trigger = [...document.querySelectorAll("button")].find(
				button => button.textContent?.trim() === "Open invoice",
			);
			if (trigger) trigger.style.cssText = "position:fixed;top:100px;left:40px";
			window.scrollTo({ behavior: "instant", left: 120, top: 900 });
		});
		const position = () =>
			page.evaluate(() => ({
				width: document.body.getBoundingClientRect().width,
				x: window.scrollX,
				y: window.scrollY,
			}));
		const before = await position();
		expect(before.y).toBe(900);
		expect(before.x).toBe(120);
		await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
		await expect(page.getByRole("dialog", { exact: true, name: "Invoice" })).toBeVisible();
		expect(await position()).toEqual(before);
		await page.mouse.move(5, 5);
		await page.mouse.wheel(100, 400);
		await page.evaluate(
			() => new Promise(resolve => requestAnimationFrame(() => requestAnimationFrame(resolve))),
		);
		expect(await position()).toEqual(before);
		await page.getByRole("button", { exact: true, name: "Edit purchase" }).click();
		await expect(page.getByRole("dialog", { exact: true, name: "Edit purchase" })).toBeVisible();
		expect(await position()).toEqual(before);
		await page.keyboard.press("Escape");
		await expect(page.getByRole("dialog", { exact: true, name: "Edit purchase" })).toHaveCount(0);
		expect(await position()).toEqual(before);
		await page
			.getByRole("dialog", { exact: true, name: "Invoice" })
			.getByRole("button", { name: "Fechar" })
			.click();
		await expect(page.getByRole("dialog")).toHaveCount(0);
		expect(await position()).toEqual(before);
	});
}

for (const touch of [false, true]) {
	test.describe(`focused input touch=${touch}`, () => {
		test.use({ hasTouch: touch });
		test("budget category stays open when the keyboard viewport resizes", async ({ page }) => {
			await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
			await page.getByRole("button", { exact: true, name: "Edit purchase" }).click();
			const name = page.getByRole("textbox", { exact: true, name: "Nome" });
			await name.fill("Casa");
			await expect(name).toBeFocused();
			const trigger = page.getByRole("combobox", { exact: true, name: "Categoria de planejamento" });
			if (touch) await trigger.tap();
			else await trigger.click();
			await expect(page.getByRole("option", { exact: true, name: "Sem categoria" })).toBeFocused();
			// Keyboard dismissal sends resize after focus has left the text field.
			await page.evaluate(() => window.dispatchEvent(new Event("resize")));
			const option = page.getByRole("option", { exact: true, name: "Reserva" });
			await expect(option).toBeVisible();
			await expect(page.getByRole("textbox", { name: /^Buscar/ })).toHaveCount(0);
			if (touch) await option.tap();
			else await option.click();
			await expect(trigger).toContainText("Reserva");
			await expect(page.getByRole("listbox")).toHaveCount(0);
			await expect(name).toHaveValue("Casa");
			await expect(page.getByRole("dialog", { exact: true, name: "Edit purchase" })).toBeVisible();
		});
	});
}

test("fixed category selector supports keyboard navigation and typeahead", async ({ page }) => {
	await page.getByRole("button", { exact: true, name: "Open invoice" }).click();
	await page.getByRole("button", { exact: true, name: "Edit purchase" }).click();
	const trigger = page.getByRole("combobox", { exact: true, name: "Categoria de planejamento" });
	await trigger.focus();
	await page.keyboard.press("ArrowDown");
	await expect(page.getByRole("option", { exact: true, name: "Sem categoria" })).toBeFocused();
	await page.keyboard.press("Home");
	await expect(page.getByRole("option", { exact: true, name: "Etiqueta" })).toBeFocused();
	await page.keyboard.press("r");
	await expect(page.getByRole("option", { exact: true, name: "Reserva" })).toBeFocused();
	await page.keyboard.press("Enter");
	await expect(trigger).toContainText("Reserva");
	await expect(trigger).toBeFocused();
	await page.keyboard.press("Enter");
	await page.keyboard.press("Escape");
	await expect(page.getByRole("listbox")).toHaveCount(0);
	await expect(page.getByRole("dialog", { exact: true, name: "Edit purchase" })).toBeVisible();
});
