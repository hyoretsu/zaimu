import { expect, test } from "@playwright/test";

test.use({ hasTouch: true, viewport: { height: 844, width: 390 } });
test("selection preserves April 2026 position while loading older invoices", async ({ page, baseURL }) => {
	await page.route("**/*", route =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
	);
	await page.goto("/tests/browser/fixtures/statement-scroll.html");
	await page.addStyleTag({
		content: "*, *::before, *::after { animation: none !important; transition: none !important; }",
	});
	await expect(page.getByRole("tab", { selected: true })).toBeVisible();
	const viewport = page.locator('[data-slot="scroll-area-viewport"]');
	for (let count = 0; count < 2; count++) {
		const first = await page.getByRole("tab").first().getAttribute("id");
		const anchor = await viewport.evaluate(element => {
			element.scrollLeft = 0;
			const tab = element.querySelector<HTMLElement>('[data-slot="tabs-trigger"]')!;
			return { label: tab.getAttribute("aria-label")!, x: tab.getBoundingClientRect().left };
		});
		await expect.poll(() => page.getByRole("tab").first().getAttribute("id")).not.toBe(first);
		await expect
			.poll(async () =>
				Math.abs(
					(await page.getByRole("tab", { exact: true, name: anchor.label }).boundingBox())!.x -
						anchor.x,
				),
			)
			.toBeLessThan(1);
	}
	const april = page.getByRole("tab", { name: /Abr\/26/i });
	await april.evaluate(element => {
		const viewport = element.closest('[data-slot="scroll-area-viewport"]')!;
		viewport.scrollLeft +=
			element.getBoundingClientRect().left - viewport.getBoundingClientRect().left - 40;
	});
	const before = await april.boundingBox();
	const firstBefore = await page.getByRole("tab").first().getAttribute("id");
	await april.tap();
	await expect(page.getByTestId("selected")).toHaveText("2026-04");
	await expect(page.locator("html")).toHaveAttribute("data-statement-navigation", /statement=2026-04/);
	await expect.poll(() => page.getByRole("tab").first().getAttribute("id")).not.toBe(firstBefore);
	await expect.poll(async () => Math.abs((await april.boundingBox())!.x - before!.x)).toBeLessThan(1);
	await expect(april).toHaveAttribute("aria-selected", "true");
});
