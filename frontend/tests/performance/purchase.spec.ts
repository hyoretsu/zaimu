import { expect, test } from "@playwright/test";

const api = "http://127.0.0.1:3335";
const percentile95 = (values: number[]) =>
	values.toSorted((a, b) => a - b)[Math.ceil(values.length * 0.95) - 1]!;

test("release purchase save measures persisted confirmation and refreshed content separately", async ({
	page,
	baseURL,
}, testInfo) => {
	const samples: {
		confirmationMs: number;
		refreshMs: number;
		mutationMs: number;
		requests: number;
		round: number;
		longTasks: number;
		longTaskMs: number;
	}[] = [];
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.name));
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
	await page.addInitScript(() => {
		const metrics = { count: 0, durationMs: 0 };
		Object.assign(window, { performanceLongTasks: metrics });
		new PerformanceObserver(list => {
			for (const entry of list.getEntries()) {
				metrics.count++;
				metrics.durationMs += entry.duration;
			}
		}).observe({ buffered: true, type: "longtask" });
	});
	await page.goto("/credit-cards");
	const createButton = page.getByRole("button", { exact: true, name: "Nova compra" }).first();
	await expect(createButton).toBeEnabled();
	const diagnostic = process.env.PERFORMANCE_DIAGNOSTIC === "true";
	for (let round = 1; round <= (diagnostic ? 1 : 3); round++)
		for (let index = 0; index < (diagnostic ? 5 : 25); index++) {
			console.info(`purchase sample ${index}: opening`);
			await createButton.click();
			const dialog = page.getByRole("dialog");
			console.info(`purchase sample ${index}: selecting card`);
			await dialog.getByRole("combobox", { exact: true, name: "Cartão" }).click();
			await page.getByRole("option").first().click();
			await dialog.getByLabel("Descrição", { exact: true }).fill(`Browser performance ${index}`);
			await dialog.getByLabel(/Valor da compra/).fill("12,34");
			let requests = 0;
			const count = () => {
				requests++;
			};
			page.on("request", count);
			const mutation = page.waitForResponse(
				response =>
					response.request().method() === "POST" &&
					/\/credit-cards\/[^/]+\/purchases$/.test(new URL(response.url()).pathname),
			);
			const refreshed = page.waitForResponse(
				response =>
					response.request().method() === "GET" &&
					new URL(response.url()).pathname.replace(/\/$/, "") === "/credit-cards" &&
					response.status() === 200,
			);
			console.info(`purchase sample ${index}: saving`);
			const beforeCardsResponse = await page.request.get(`${api}/credit-cards`);
			expect(beforeCardsResponse.ok()).toBeTruthy();
			const beforeCards = (await beforeCardsResponse.json()) as {
				name: string;
				currency: string;
				limit: { availableLimit: number };
			}[];
			const selectedCard = beforeCards.find(card => card.name === "Cartão 01");
			expect(selectedCard).toBeDefined();
			const expectedAvailable = new Intl.NumberFormat("pt-BR", {
				currency: selectedCard!.currency,
				style: "currency",
			}).format(Math.max(0, selectedCard!.limit.availableLimit - 12.34));
			const beforeLongTasks = await page.evaluate(() => ({
				...(window as unknown as { performanceLongTasks: { count: number; durationMs: number } })
					.performanceLongTasks,
			}));
			await page.evaluate(expectedAvailable => {
				const state = { confirmedAt: 0, refreshedAt: 0, startedAt: 0 };
				Object.assign(window, { performancePurchase: state });
				document.addEventListener(
					"click",
					event => {
						if ((event.target as HTMLElement).closest("button")?.textContent?.trim() === "Salvar compra")
							state.startedAt = performance.now();
					},
					{ capture: true, once: true },
				);
				const observer = new MutationObserver(() => {
					if (
						state.startedAt &&
						document.body.textContent?.includes("Compra registrada e faturas recalculadas.")
					) {
						state.confirmedAt ||= performance.now();
					}
				});
				observer.observe(document.body, { characterData: true, childList: true, subtree: true });
				const refreshObserver = new MutationObserver(() => {
					if (state.startedAt && document.querySelector("main")?.textContent?.includes(expectedAvailable)) {
						requestAnimationFrame(() =>
							requestAnimationFrame(() => {
								state.refreshedAt ||= performance.now();
							}),
						);
						refreshObserver.disconnect();
					}
				});
				refreshObserver.observe(document.body, { characterData: true, childList: true, subtree: true });
			}, expectedAvailable);
			const startedAt = performance.now();
			await dialog.getByRole("button", { exact: true, name: "Salvar compra" }).click();
			let cleanupUrl: string | undefined;
			try {
				const saved = await mutation;
				const rows = (await saved.json()) as { purchaseId?: string; id: string }[];
				const createdId = rows[0]?.purchaseId ?? rows[0]?.id;
				if (createdId) cleanupUrl = `${api}${new URL(saved.url()).pathname}/${createdId}`;
				const mutationMs = performance.now() - startedAt;
				expect(saved.status()).toBe(200);
				await expect(
					page.getByText("Compra registrada e faturas recalculadas.", { exact: true }).last(),
				).toBeVisible();
				const confirmationMs = await page.evaluate(() => {
					const state = (
						window as unknown as { performancePurchase: { startedAt: number; confirmedAt: number } }
					).performancePurchase;
					return state.confirmedAt - state.startedAt;
				});
				expect(confirmationMs).toBeGreaterThan(0);
				const refreshResponse = await refreshed;
				await refreshResponse.finished();
				const updatedCards = (await refreshResponse.json()) as {
					id: string;
					currency: string;
					limit: { availableLimit: number };
				}[];
				const cardId = new URL(saved.url()).pathname.split("/")[2];
				const updatedCard = updatedCards.find(card => card.id === cardId);
				expect(updatedCard).toBeDefined();
				const available = new Intl.NumberFormat("pt-BR", {
					currency: updatedCard!.currency,
					style: "currency",
				}).format(updatedCard!.limit.availableLimit);
				await expect(page.getByText(available, { exact: true }).first()).toBeVisible();
				await page.evaluate(
					() =>
						new Promise<void>(resolve => requestAnimationFrame(() => requestAnimationFrame(() => resolve()))),
				);
				expect(available).toBe(expectedAvailable);
				const refreshMs = await page.evaluate(() => {
					const state = (
						window as unknown as { performancePurchase: { startedAt: number; refreshedAt: number } }
					).performancePurchase;
					return state.refreshedAt - state.startedAt;
				});
				expect(refreshMs).toBeGreaterThan(0);
				page.off("request", count);
				const afterLongTasks = await page.evaluate(
					() =>
						(window as unknown as { performanceLongTasks: { count: number; durationMs: number } })
							.performanceLongTasks,
				);
				samples.push({
					confirmationMs,
					longTaskMs: afterLongTasks.durationMs - beforeLongTasks.durationMs,
					longTasks: afterLongTasks.count - beforeLongTasks.count,
					mutationMs,
					refreshMs,
					requests,
					round,
				});
				const id = rows[0]?.purchaseId ?? rows[0]?.id;
				expect(id).toBeDefined();
			} finally {
				page.off("request", count);
				if (cleanupUrl) {
					const deleted = await page.request.delete(cleanupUrl);
					expect(deleted.ok()).toBeTruthy();
				}
			}
			// Reload resets UI state and uses the persisted cleanup result before next measurement.
			await page.reload();
			await expect(createButton).toBeEnabled();
		}
	const report = {
		diagnostic,
		errors,
		p95ConfirmationMs: percentile95(samples.map(row => row.confirmationMs)),
		p95RefreshMs: percentile95(samples.map(row => row.refreshMs)),
		samples,
	};
	await testInfo.attach("purchase-performance", {
		body: JSON.stringify(report, null, 2),
		contentType: "application/json",
	});
	expect(errors).toEqual([]);
	expect(report.p95ConfirmationMs).toBeLessThan(1000);
	expect(report.p95RefreshMs).toBeLessThan(1000);
});
