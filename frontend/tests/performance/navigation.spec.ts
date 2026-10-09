import { expect, test } from "@playwright/test";

const routes = [
	"/",
	"/accounts",
	"/credit-cards",
	"/transactions",
	"/debts",
	"/recurring",
	"/loans",
	"/settings",
];

test("release navigation measures mount and settled required reads for every main module", async ({
	page,
	baseURL,
}, testInfo) => {
	const api = "http://127.0.0.1:3335";
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
	expect(login.ok()).toBeTruthy();
	expect(login.headers()["x-performance-namespace"]).toBe("zaimu_performance");
	await page.addInitScript(() => {
		const metrics = { usableAt: 0 };
		Object.assign(window, { performanceNavigation: metrics });
		const observer = new MutationObserver(() => {
			if (
				!metrics.usableAt &&
				document.querySelector("main h1") &&
				!document.querySelector("main .animate-pulse")
			) {
				requestAnimationFrame(() =>
					requestAnimationFrame(() => {
						if (!document.querySelector("main .animate-pulse")) metrics.usableAt ||= performance.now();
					}),
				);
			}
		});
		observer.observe(document, { attributes: true, childList: true, subtree: true });
	});
	await page.clock.setFixedTime(new Date("2026-10-04T12:00:00-03:00"));
	const diagnostic = process.env.PERFORMANCE_DIAGNOSTIC === "true";
	const samples: { route: string; round: number; usableMs: number; requests: number; failures: number[] }[] =
		[];
	for (let round = 1; round <= (diagnostic ? 1 : 3); round++)
		for (let iteration = 0; iteration < (diagnostic ? 1 : 25); iteration++)
			for (const route of routes) {
				const failures: number[] = [];
				let requests = 0;
				const onResponse = (response: import("@playwright/test").Response) => {
					if (new URL(response.url()).origin !== api) return;
					requests++;
					// Auth guards may probe a session; a rejected business read remains a failure.
					if (response.status() >= 400) failures.push(response.status());
				};
				page.on("response", onResponse);
				await page.goto(route, { waitUntil: "domcontentloaded" });
				await expect(page.locator("h1").first()).toBeVisible({ timeout: 60000 });
				await expect(page.locator(".animate-pulse")).toHaveCount(0);
				await page.evaluate(
					() =>
						new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
				);
				const usableMs = await page.evaluate(
					() =>
						(window as unknown as { performanceNavigation: { usableAt: number } }).performanceNavigation
							.usableAt,
				);
				expect(usableMs).toBeGreaterThan(0);
				page.off("response", onResponse);
				samples.push({ failures, requests, round, route, usableMs });
			}
	await testInfo.attach("navigation-performance", {
		body: JSON.stringify({ diagnostic, samples }, null, 2),
		contentType: "application/json",
	});
	for (const route of routes)
		for (const round of [...new Set(samples.map(sample => sample.round))]) {
			const selected = samples.filter(sample => sample.route === route && sample.round === round);
			expect(selected.flatMap(sample => sample.failures)).toEqual([]);
			const sorted = selected.map(sample => sample.usableMs).sort((a, b) => a - b);
			expect(sorted[Math.ceil(sorted.length * 0.95) - 1]).toBeLessThan(1000);
		}
});
