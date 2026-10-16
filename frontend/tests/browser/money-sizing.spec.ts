import { expect, test } from "@playwright/test";

for (const width of [320, 375, 640, 768, 1024, 1280, 1690]) {
	test(`monetary amounts fit and non-monetary inputs keep standard typography at ${width}px`, async ({
		page,
		baseURL,
	}) => {
		await page.setViewportSize({ height: 900, width });
		await page.route("**/*", route =>
			new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
		);
		await page.goto("/tests/browser/fixtures/money-sizing.html");
		await expect(page.getByLabel("Despesa")).toHaveValue(/100\.000,00/);
		await page.evaluate(() => document.fonts.ready);
		const failures = await page.evaluate(() => {
			const errors: string[] = [];
			const reference = getComputedStyle(document.querySelector("input")!).fontSize;
			if (reference !== (innerWidth < 768 ? "16px" : "14px"))
				errors.push(`Unexpected standard font: ${reference}`);
			for (const input of document.querySelectorAll("input")) {
				const style = getComputedStyle(input);
				if (style.fontSize !== reference)
					errors.push(`${input.id}: inconsistent font size ${style.fontSize}`);
				const canvas = document.createElement("canvas").getContext("2d")!;
				canvas.font = `${style.fontWeight} ${style.fontSize} ${style.fontFamily}`;
				const available =
					input.clientWidth - Number.parseFloat(style.paddingLeft) - Number.parseFloat(style.paddingRight);
				if (canvas.measureText(input.value).width > available + 1) errors.push(`${input.id}: clipped value`);
			}
			for (const amount of document.querySelectorAll("[role=group] p.font-bold")) {
				const range = document.createRange();
				range.selectNodeContents(amount);
				if (range.getBoundingClientRect().width > amount.clientWidth + 1)
					errors.push(`${amount.textContent}: overlapping amount`);
				if (Number.parseFloat(getComputedStyle(amount).fontSize) < 20)
					errors.push(`${amount.textContent}: unreadable amount`);
			}
			if (document.documentElement.scrollWidth > innerWidth) errors.push("horizontal page overflow");
			return errors;
		});
		// Check geometry and legibility together: shrinking every field must not satisfy the test.
		expect(failures).toEqual([]);
		await page.screenshot({ fullPage: true, path: test.info().outputPath("money-sizing.png") });
	});
}
