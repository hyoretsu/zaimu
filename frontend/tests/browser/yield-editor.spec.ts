import { expect, test } from "@playwright/test";

for (const width of [1280, 390]) {
	for (const editing of [false, true]) {
		test(`preserves dirty yield fields and replacement identity (${editing ? "existing" : "new"}) at ${width}px`, async ({
			page,
		}) => {
			await page.setViewportSize({ height: 1000, width });
			await page.route("**/*", async route => {
				const url = new URL(route.request().url());
				if (url.pathname.includes("/financial-institutions/fixture/profiles"))
					return route.fulfill({ json: [{ id: "standard", isDefault: true, name: "Padrão" }] });
				if (url.pathname.includes("/financial-institutions/fixture/policies"))
					return route.fulfill({
						json: [
							{
								countryCode: "BR",
								currency: null,
								effectiveDate: "2026-01-01",
								profileId: "standard",
								rules: [{ yieldFixedRate: 1 }],
								yieldPeriod: "MONTHLY",
								yieldTaxRate: 15,
							},
						],
					});
				if (url.hostname !== "127.0.0.1") return route.fulfill({ json: [] });
				return route.continue();
			});
			await page.goto("/tests/browser/fixtures/yield-editor.html", { waitUntil: "domcontentloaded" });
			if (editing) await page.getByRole("button", { name: /01\/01\/2026/ }).click();
			const rate = page.getByRole("textbox", { exact: true, name: "Taxa fixa" });
			await rate.fill("2,5");
			await page.getByLabel("Alíquota fixa", { exact: true }).fill("17");
			await page.getByRole("textbox", { exact: true, name: "Vigente desde" }).fill("01/01/2020");
			await page.getByRole("textbox", { exact: true, name: "Vigente desde" }).press("Tab");
			await expect(rate).toHaveValue(/2[,.]5/);
			await expect(page.getByLabel("Alíquota fixa", { exact: true })).toHaveValue(/17/);
			await expect(page.getByRole("button", { name: /01\/01\/2026/ })).toHaveAttribute(
				"aria-pressed",
				String(editing),
			);
			await page.screenshot({ fullPage: true, path: `/tmp/zaimu-yield-editor-${width}.png` });
			await page.getByRole("button", { name: /Salvar|Enviar/ }).click();
			await expect
				.poll(() =>
					page.evaluate(() => (window as unknown as { submittedPolicy?: unknown }).submittedPolicy),
				)
				.toMatchObject({
					replacesEffectiveDate: editing ? "2026-01-01" : undefined,
					requestedEffectiveDate: "2020-01-01",
					rules: [{ yieldFixedRate: 2.5 }],
					yieldTaxRate: 17,
				});
		});
	}
}
