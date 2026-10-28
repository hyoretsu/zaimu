import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3335";

for (const viewport of [
	{ height: 900, name: "desktop", width: 1440 },
	{ height: 844, name: "mobile", width: 390 },
]) {
	test(`card listing loads only account options and fetches configuration when editing (${viewport.name})`, async ({
		page,
		baseURL,
	}, testInfo) => {
		await page.setViewportSize(viewport);
		const paths: string[] = [];
		page.on("request", request => {
			const url = new URL(request.url());
			if (url.origin === api && request.method() === "GET") paths.push(url.pathname.replace(/\/$/, ""));
		});
		await page.route("**/*", route => {
			const url = new URL(route.request().url());
			if (url.origin === baseURL || url.origin === api) return route.continue();
			if (url.hostname === "ipapi.co") return route.fulfill({ json: { country_code: "BR" } });
			return route.abort("blockedbyclient");
		});
		const login = await page.request.post(`${api}/api/auth/sign-in/email`, {
			data: { email: "performance0@zaimu.local", password: "Performance-local-2026" },
			headers: { origin: baseURL! },
		});
		expect(login.status()).toBe(200);
		expect(login.headers()["x-performance-namespace"]).toBe("zaimu_performance");
		await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-03:00"));
		const optionsResponse = page.waitForResponse(
			response => new URL(response.url()).pathname === "/financial-accounts/options",
		);
		await page.goto("/credit-cards");
		const options = await optionsResponse;
		expect(options.ok()).toBeTruthy();
		const rows = (await options.json()) as Record<string, unknown>[];
		expect(rows.length).toBeGreaterThan(0);
		for (const row of rows) {
			expect(row.type).toBe("CREDIT_CARD");
			expect(Object.keys(row).sort()).toEqual([
				"currency",
				"id",
				"institution",
				"isHidden",
				"name",
				"type",
			]);
		}
		await expect(page.getByRole("heading", { exact: true, name: "Cartão 01" })).toBeVisible({
			timeout: 60000,
		});
		const initialPaths = [...paths];
		expect(initialPaths).not.toContain("/financial-accounts");
		expect(initialPaths).not.toContain("/financial-institutions");
		expect(
			initialPaths.filter(
				path => /^\/financial-accounts\/[^/]+$/.test(path) && !path.endsWith("/options"),
			),
		).toEqual([]);
		await page.screenshot({ fullPage: true, path: testInfo.outputPath(`cards-${viewport.name}.png`) });
		let releaseDetail!: () => void;
		let failDetail = true;
		const gate = new Promise<void>(resolve => {
			releaseDetail = resolve;
		});
		await page.route("**/financial-accounts/*", async route => {
			if (new URL(route.request().url()).pathname.endsWith("/options")) return route.continue();
			await gate;
			return failDetail
				? route.fulfill({ json: { error: "Leitura indisponível" }, status: 500 })
				: route.continue();
		});
		const edit = page.getByRole("button", { exact: true, name: "Editar Cartão 01" });
		try {
			await edit.click();
			await expect(edit).toHaveAttribute("aria-busy", "true");
			await page.screenshot({
				fullPage: true,
				path: testInfo.outputPath(`loading-${viewport.name}.png`),
			});
		} finally {
			releaseDetail();
		}
		await expect(
			page.getByRole("alert").filter({ hasText: "Não foi possível carregar o cartão" }),
		).toBeVisible({ timeout: 60000 });
		await page.screenshot({ fullPage: true, path: testInfo.outputPath(`error-${viewport.name}.png`) });
		failDetail = false;
		const detailResponse = page.waitForResponse(
			response =>
				/^\/financial-accounts\/[^/]+$/.test(new URL(response.url()).pathname) &&
				!new URL(response.url()).pathname.endsWith("/options"),
		);
		await edit.click();
		expect((await detailResponse).ok()).toBeTruthy();
		await expect(page.getByRole("dialog")).toBeVisible({ timeout: 60000 });
		await page.screenshot({ path: testInfo.outputPath(`editor-${viewport.name}.png`) });
		await page.getByRole("button", { exact: true, name: "Descartar" }).click();
		await expect(page.getByRole("dialog")).not.toBeVisible();
		await page.screenshot({
			fullPage: true,
			path: testInfo.outputPath(`cards-restored-${viewport.name}.png`),
		});
		expect(await page.evaluate(() => document.documentElement.scrollWidth <= innerWidth)).toBeTruthy();

		await testInfo.attach("card-context-requests", {
			body: JSON.stringify({
				initialPaths,
				optionCount: rows.length,
				optionsBytes: (await options.body()).byteLength,
			}),
			contentType: "application/json",
		});
	});
}
