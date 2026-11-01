import { expect, test } from "@playwright/test";

for (const width of [1440, 390])
	test(`statement-only deep link performs one owner lookup (${width})`, async ({
		page,
		baseURL,
	}, testInfo) => {
		await page.setViewportSize({ height: 900, width });
		const paths: string[] = [];
		const invoice = {
			balanceAmount: 20,
			creditCardId: "card-9",
			dueDate: "2026-11-05",
			id: "invoice",
			isPaid: false,
			paidAmount: 0,
			statementDate: "2026-10-25",
			totalAmount: 20,
		};
		const cards = Array.from({ length: 10 }, (_, index) => ({
			accountName: `Cartão ${index + 1}`,
			creditLimit: 1000,
			currency: "BRL",
			currentStatement: null,
			dueDay: 5,
			excludeFromTotals: false,
			financialAccountId: `account-${index}`,
			id: `card-${index}`,
			limit: { availableLimit: 1000, effectiveLimit: 1000, temporaryCredit: 0, usedLimit: 0 },
			statementDay: 25,
			workingDueDate: false,
		}));
		let release!: () => void;
		const gate = new Promise<void>(resolve => {
			release = resolve;
		});
		let mode = "loading";
		await page.routeWebSocket("**", socket => socket.close());
		await page.route("**/*", async route => {
			const url = new URL(route.request().url());
			if (url.origin === baseURL) return route.continue();
			paths.push(url.pathname);
			if (url.pathname.includes("/api/auth/get-session"))
				return route.fulfill({
					json: {
						session: {
							expiresAt: "2099-01-01T00:00:00Z",
							id: "session-test",
							token: "test",
							userId: "owner-test",
						},
						user: {
							createdAt: "2026-10-04",
							email: "test@test.invalid",
							emailVerified: true,
							id: "owner-test",
							name: "Teste",
							updatedAt: "2026-10-04",
						},
					},
				});
			if (url.pathname.replace(/\/$/, "") === "/credit-cards") return route.fulfill({ json: cards });
			if (url.pathname === "/credit-cards/statement-owner/invoice") {
				if (mode === "loading") await gate;
				return route.fulfill({ json: mode === "missing" ? null : { creditCardId: "card-9" } });
			}
			if (/\/credit-cards\/[^/]+\/statements$/.test(url.pathname))
				return route.fulfill({ json: { hasMore: false, items: [invoice], nextCursor: null } });
			if (url.pathname === "/credit-cards/card-9/statements/invoice")
				return route.fulfill({ json: { ...invoice, payments: [], purchases: [] } });
			if (url.pathname === "/financial-accounts/options") return route.fulfill({ json: [] });
			if (url.pathname === "/currency-preferences")
				return route.fulfill({ json: { effectiveCurrency: "BRL", preferredCurrency: "BRL" } });
			if (url.hostname === "ipapi.co") return route.fulfill({ json: { country_code: "BR" } });
			return route.fulfill({ json: [] });
		});
		await page.goto("/credit-cards");
		await expect(page.getByRole("heading", { exact: true, name: "Cartão 10" })).toBeVisible();
		expect(
			paths.filter(
				path => path.includes("/statement-owner/") || /\/credit-cards\/[^/]+\/statements$/.test(path),
			),
		).toEqual([]);
		await page.screenshot({
			fullPage: true,
			path: testInfo.outputPath(`cards-no-histories-${width}.png`),
		});
		paths.length = 0;
		await page.goto("/credit-cards?statement=invoice");
		await expect
			.poll(() => paths.filter(p => p === "/credit-cards/statement-owner/invoice").length)
			.toBe(1);
		expect(paths.filter(p => /\/credit-cards\/[^/]+\/statements$/.test(p))).toEqual([]);
		await page.screenshot({ fullPage: true, path: testInfo.outputPath(`owner-loading-${width}.png`) });
		mode = "ready";
		release();
		await expect(page.getByRole("dialog")).toBeVisible();
		await expect
			.poll(() => paths.filter(p => /\/credit-cards\/[^/]+\/statements$/.test(p)))
			.toEqual(["/credit-cards/card-9/statements"]);
		await expect(page.getByText("Não foi possível carregar as faturas")).toHaveCount(0);
		await page.screenshot({ fullPage: true, path: testInfo.outputPath(`owner-resolved-${width}.png`) });
		expect(paths.filter(p => p === "/credit-cards/statement-owner/invoice")).toHaveLength(1);
		await testInfo.attach("statement-requests", {
			body: JSON.stringify(paths.filter(p => p.startsWith("/credit-cards"))),
			contentType: "application/json",
		});
	});
