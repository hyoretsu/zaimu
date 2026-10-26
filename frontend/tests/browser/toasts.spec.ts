import { expect, test } from "@playwright/test";

const cards = "[data-sonner-toast]:not([data-removed=true])";
test.beforeEach(async ({ page, baseURL }) => {
	await page.route("**/*", route =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
	);
	await page.goto("/tests/browser/fixtures/toasts.html");
	await page.waitForFunction(() => Boolean(window.notifications));
});

test("sixth toast removes oldest permanently, without hidden queue", async ({ page }) => {
	await page.evaluate(() => {
		for (let i = 0; i < 6; i++)
			window.notifications.info(`Notice ${i}`, { duration: Number.POSITIVE_INFINITY });
	});
	await expect(page.locator(cards)).toHaveCount(5);
	await expect(page.locator(cards).filter({ hasText: "Notice 0" })).toHaveCount(0);
	await page.evaluate(() => window.notifications.dismiss(window.notifications.getToasts().at(-1)!.id));
	await expect(page.locator(cards)).toHaveCount(4);
	await expect(page.locator(cards).filter({ hasText: "Notice 0" })).toHaveCount(0);
});

test("repeated errors keep latest recovery action and compact network message", async ({ page }) => {
	await page.evaluate(() => {
		window.notifications.error("Request timed out: POST https://private.example/items/123", {
			action: {
				label: "Recover",
				onClick: () => {
					window.recovered = 1;
				},
			},
			duration: Number.POSITIVE_INFINITY,
		});
		window.notifications.error("Request timed out: POST https://private.example/items/456", {
			action: {
				label: "Recover",
				onClick: () => {
					window.recovered = 2;
				},
			},
			duration: Number.POSITIVE_INFINITY,
		});
	});
	await expect(page.locator(cards)).toHaveCount(1);
	await expect(page.locator(cards)).not.toContainText("https://");
	await page.getByRole("button", { name: "Recover" }).click();
	await expect.poll(() => page.evaluate(() => window.recovered)).toBe(2);
	await expect(page.locator(cards)).toHaveCount(0);
});

for (const direction of ["left", "right", "top"] as const) {
	test(`swipe ${direction} dismisses loading without resurrecting completion`, async ({ page }) => {
		const id = await page.evaluate(() => window.notifications.loading("Saving"));
		const card = page.locator(cards);
		await expect(card).toBeVisible();
		await card.hover();
		const box = (await card.boundingBox())!;
		const x = box.x + box.width / 2,
			y = box.y + box.height / 2;
		await page.mouse.move(x, y);
		await page.mouse.down();
		await page.mouse.move(
			x + (direction === "left" ? -150 : direction === "right" ? 150 : 0),
			y - (direction === "top" ? 100 : 0),
			{ steps: 12 },
		);
		await page.mouse.up();
		await expect(card).toHaveCount(0);
		await page.evaluate(id => window.notifications.success("Saved", { id }), id);
		await page.waitForTimeout(100);
		await expect(page.locator(cards)).toHaveCount(0);
	});
}

test("short gesture preserves toast; close button appears only on desktop", async ({ page, isMobile }) => {
	await page.evaluate(() => window.notifications.info("Notice", { duration: Number.POSITIVE_INFINITY }));
	const card = page.locator(cards);
	await expect(card).toBeVisible();
	await expect(card.locator("[data-close-button]")).toHaveCount(isMobile ? 0 : 1);
	await card.hover();
	const box = (await card.boundingBox())!;
	await page.mouse.move(box.x + box.width / 2, box.y + box.height / 2);
	await page.mouse.down();
	await page.mouse.move(box.x + box.width / 2 + 3, box.y + box.height / 2, { steps: 3 });
	await page.waitForTimeout(200);
	await page.mouse.up();
	await expect(card).toHaveCount(1);
	if (!isMobile) {
		await card.locator("[data-close-button]").focus();
		await page.keyboard.press("Enter");
		await expect(card).toHaveCount(0);
	}
});

test("loading completion auto-closes and dismissed promise still resolves", async ({ page }) => {
	const id = await page.evaluate(() => window.notifications.loading("Working"));
	await expect(page.locator(cards)).toHaveCount(1);
	await page.evaluate(id => window.notifications.success("Done", { duration: 150, id }), id);
	await expect(page.locator(cards)).toHaveCount(0);
	await page.evaluate(async () => {
		let complete!: (value: number) => void;
		const job = window.notifications.promise(
			new Promise<number>(resolve => {
				complete = resolve;
			}),
			{ id: "job", loading: "Working", success: "Done" },
		);
		window.notifications.dismiss("job");
		complete(42);
		window.recovered = await job.unwrap();
	});
	await expect.poll(() => page.evaluate(() => window.recovered)).toBe(42);
	await expect(page.locator(cards)).toHaveCount(0);
});
