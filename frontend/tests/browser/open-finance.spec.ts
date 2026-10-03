import { expect, test } from "@playwright/test";
import type { OpenFinanceConnection, OpenFinanceSyncStatus } from "../../src/lib/api";

const TARGET_URL = process.env.OPEN_FINANCE_BROWSER_URL ?? "http://127.0.0.1:55441";
test("MeuPluggy wizard, bindings, review, return triggers and disconnect on desktop/mobile", async ({
	page,
}) => {
	await page.routeWebSocket("**", socket => socket.close());
	const errors: string[] = [];
	page.on("pageerror", error => errors.push(error.message));
	let configured = false,
		rejectCredentials = true,
		rejectConnection = true,
		rejectSync = false,
		discoveryEnabled = false,
		discoveryRequests = 0,
		syncRequests = 0;
	const config = () => ({ available: true, configured, connections, lastQueriedAt: null });
	let connections: OpenFinanceConnection[] = [];
	const account = {
		balance: 0,
		createdAt: "2026-01-01",
		id: "local",
		institution: null,
		name: "Conta local",
		type: "CHECKING",
		updatedAt: "2026-01-01",
		userId: "owner",
	};
	let run: OpenFinanceSyncStatus["run"] = null,
		reviews: OpenFinanceSyncStatus["reviews"] = [];
	await page.route("**/*", async route => {
		const req = route.request(),
			url = new URL(req.url()),
			path = url.pathname.replace(/^\/api(?=\/)/, "");
		if (url.origin === TARGET_URL) return route.continue();
		// No outbound requests: all API responses mocked locally, external assets blocked.
		if (!["127.0.0.1", "localhost"].includes(url.hostname) && !["fetch", "xhr"].includes(req.resourceType()))
			return route.abort();

		let data: unknown = [];
		if (path.includes("/auth/get-session"))
			data = {
				session: { expiresAt: "2099-01-01T00:00:00Z", id: "test-session", userId: "owner" },
				user: {
					createdAt: "2026-01-01",
					email: "owner@example.test",
					emailVerified: true,
					id: "owner",
					name: "Owner",
					updatedAt: "2026-01-01",
				},
			};
		else if (path === "/open-finance/" && req.method() === "DELETE") {
			configured = false;
			connections = [];
			data = { success: true };
		} else if (path === "/open-finance/") data = config();
		else if (path === "/open-finance/credentials") {
			if (rejectCredentials) {
				rejectCredentials = false;
				return route.fulfill({
					body: JSON.stringify({ error: "Credenciais ou autorização Pluggy inválidas" }),
					contentType: "application/json",
					status: 422,
				});
			}
			configured = true;
			data = { success: true };
		} else if (path === "/open-finance/connections/discover") {
			discoveryRequests++;
			if (discoveryEnabled && !connections.some(connection => connection.id === "discovered"))
				connections.push({
					bankName: "Banco descoberto",
					bankUpdatedAt: null,
					bindings: [],
					id: "discovered",
					itemId: "discovered-item",
					remoteAccounts: [
						{ currencyCode: "BRL", id: "discovered-account", name: "Conta descoberta", type: "BANK" },
					],
					status: "UPDATED",
				});
			data = { ...config(), discoveryAvailable: discoveryEnabled, errors: [] };
		} else if (path === "/open-finance/connections") {
			if (rejectConnection) {
				rejectConnection = false;
				return route.fulfill({
					body: JSON.stringify({ error: "Conexão Pluggy não encontrada. Confira o itemId." }),
					contentType: "application/json",
					status: 422,
				});
			}
			connections = [
				{
					bankName: "Banco simulado",
					bankUpdatedAt: "2026-10-03T00:00:00Z",
					bindings: [],
					id: "connection",
					itemId: "item",
					remoteAccounts: [{ currencyCode: "BRL", id: "remote", name: "Conta bancária", type: "BANK" }],
					status: "UPDATED",
				},
			];
			data = config();
		} else if (path === "/open-finance/connections/connection/bindings") {
			const input = req.postDataJSON();
			connections[0].bindings = input.financialAccountId
				? [{ connectionId: "connection", id: "binding", ...input }]
				: [];
			data = { success: true };
		} else if (path === "/open-finance/sync" && req.method() === "POST") {
			if (rejectSync && req.postDataJSON()?.force) {
				rejectSync = false;
				return route.fulfill({
					body: JSON.stringify({ error: "Limite de consultas Pluggy atingido. Tente novamente mais tarde." }),
					contentType: "application/json",
					status: 429,
				});
			}
			syncRequests++;
			data = { runId: connections[0]?.bindings.length ? "run" : null };
		} else if (path === "/open-finance/sync") data = { reviews, run };
		else if (path === "/financial-accounts") data = [account];
		else if (path === "/credit-cards")
			data = [
				{
					accountName: "Cartão local",
					creditLimit: 1000,
					dueDay: 10,
					financialAccountId: "card-account",
					id: "card",
					statementDay: 1,
					statements: [],
				},
			];
		else if (path === "/credit-card-imports/card-review")
			data = {
				creditCardId: "card",
				dueDate: "2026-02-10",
				fileName: "MeuPluggy - revisão",
				hasMore: false,
				id: "card-review",
				items: [
					{
						createdAt: "2026-01-15",
						currentInstallment: 1,
						description: "Compra incompleta",
						duplicates: [],
						id: "incomplete-purchase",
						installmentAmount: 50,
						installments: 2,
						isSelected: true,
						isStatementCharge: false,
						metadataMissing: ["total", "calendar"],
						purchaseDate: "2026-01-15",
						tagIds: [],
						tags: [],
						totalAmount: 0,
						updatedAt: "2026-01-15",
					},
				],
				nextCursor: null,
				pendingItemCount: 1,
				provider: "MEUPLUGGY",
				statementDate: "2026-02-01",
				status: "PENDING",
			};
		else if (path === "/transaction-imports/review")
			data = {
				fileName: "MeuPluggy - revisão",
				financialAccountId: "local",
				hasMore: false,
				id: "review",
				items: [
					{
						amount: 100,
						createdAt: "2026-01-15",
						date: "2026-01-15",
						description: "Pagamento da fatura",
						duplicateReason: null,
						duplicates: [],
						id: "payment-review",
						isDuplicateIgnored: false,
						isHidden: false,
						isReconciled: false,
						isSelected: true,
						originFinancialAccountId: "local",
						requiresPaymentCard: true,
						tagIds: [],
						tags: [],
						transferSuggestions: [],
						type: "EXPENSE",
						updatedAt: "2026-01-15",
					},
				],
				nextCursor: null,
				pendingItemCount: 1,
				provider: "MEUPLUGGY",
				status: "PENDING",
			};
		return route.fulfill({ body: JSON.stringify(data), contentType: "application/json", status: 200 });
	});
	await page.goto(`${TARGET_URL}/settings/open-finance`, { waitUntil: "commit" });
	await expect(page.getByRole("heading", { exact: true, name: "Open Finance" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "1. Conecte bancos no Meu Pluggy" })).toBeVisible();
	await expect(page.getByRole("heading", { name: "2. Crie aplicação no Dashboard" })).toBeVisible();
	await expect(page.getByRole("link", { exact: true, name: "Abrir Meu Pluggy" })).toHaveAttribute(
		"href",
		"https://meu.pluggy.ai/overview",
	);
	await expect(page.getByRole("link", { name: "Abrir aplicações do Dashboard" })).toHaveAttribute(
		"href",
		"https://dashboard.pluggy.ai/applications",
	);
	await expect(
		page.getByText("Meu Pluggy e Dashboard Pluggy têm cadastros separados.", { exact: false }),
	).toBeVisible();
	// Simulate only the native opener, after browser startup, without opening an external service.
	await page.evaluate(() => {
		const calls: string[] = [];
		Object.assign(window, {
			__pluggyOpenCalls: calls,
			__TAURI_INTERNALS__: {
				invoke: async (command: string, args: { url: string }) => {
					if (command !== "plugin:opener|open_url") throw new Error("Unexpected native command");
					calls.push(args.url);
				},
			},
			isTauri: true,
		});
	});
	await page.getByRole("link", { name: "Abrir aplicações do Dashboard" }).click();
	await expect
		.poll(() => page.evaluate(() => (window as unknown as { __pluggyOpenCalls: string[] }).__pluggyOpenCalls))
		.toEqual(["https://dashboard.pluggy.ai/applications"]);
	await expect(page).toHaveURL(`${TARGET_URL}/settings/open-finance`);
	await page.evaluate(() => {
		Reflect.deleteProperty(window, "isTauri");
		Reflect.deleteProperty(window, "__TAURI_INTERNALS__");
		Reflect.deleteProperty(window, "__pluggyOpenCalls");
	});
	await page.getByRole("button", { exact: true, name: "Ampliar foto: Crie aplicação chamada Zaimu" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await expect(
		page.getByRole("dialog").getByRole("img", { name: "Crie aplicação chamada Zaimu" }),
	).toBeVisible();
	await page.keyboard.press("Escape");
	const desktopViewport = page.locator("main [data-slot='scroll-area-viewport']");
	await expect(desktopViewport).toHaveCount(1);
	await expect
		.poll(() => desktopViewport.evaluate(element => element.scrollHeight > element.clientHeight))
		.toBe(true);
	await page.mouse.move(900, 700);
	await page.mouse.wheel(0, 10000);
	await expect
		.poll(() =>
			page.getByRole("heading", { name: "4. Adicione conexões e vincule destinos" }).evaluate(element => {
				const bounds = element.getBoundingClientRect();
				return bounds.top >= 0 && bounds.bottom < window.innerHeight;
			}),
		)
		.toBe(true);
	await desktopViewport.evaluate(element => element.scrollTo(0, 0));
	await page.getByLabel("Client ID", { exact: false }).fill("dummy-client");
	await page.getByLabel("Client Secret", { exact: false }).fill("dummy-secret");
	await page.getByRole("button", { name: "Validar e salvar" }).click();
	await expect(page.getByRole("alert")).toContainText("Credenciais");
	await page.getByRole("button", { name: "Validar e salvar" }).click();
	await expect(page.getByLabel("Client Secret", { exact: false })).toHaveValue("");
	await expect(page.getByText("Pluggy exige habilitação da listagem", { exact: false })).toBeVisible();
	await page.getByLabel("itemId da conexão").fill("dummy-item");
	await page.getByRole("button", { name: "Adicionar conexão" }).click();
	await expect(page.getByRole("alert")).toContainText("itemId");
	await page.getByRole("button", { name: "Adicionar conexão" }).click();
	await expect(page.getByRole("heading", { name: "Banco simulado" })).toBeVisible();
	await page.getByRole("combobox", { name: "Destino local" }).click();
	await page.getByRole("option", { name: "Conta local" }).click();
	await page.getByRole("button", { name: "Salvar vínculo" }).click();
	await expect(page.getByRole("button", { exact: true, name: "Pausar" })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Pausar" }).click();
	await expect(page.getByRole("button", { exact: true, name: "Retomar" })).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Retomar" }).click();
	await expect(page.getByRole("button", { exact: true, name: "Pausar" })).toBeVisible();
	discoveryEnabled = true;
	const beforeDiscovery = discoveryRequests;
	const before = syncRequests;
	await page.evaluate(() => window.dispatchEvent(new Event("focus")));
	await expect.poll(() => syncRequests).toBeGreaterThan(before);
	await expect.poll(() => discoveryRequests).toBeGreaterThan(beforeDiscovery);
	await expect(page.getByRole("heading", { name: "Banco descoberto" })).toBeVisible();
	run = {
		errors: [],
		finishedAt: "2026-10-03T00:01:00Z",
		id: "run",
		imported: 9,
		linked: 0,
		pending: 1,
		processed: 10,
		startedAt: "2026-10-03T00:00:00Z",
		status: "COMPLETED",
	};
	reviews = [{ count: 1, importId: "review", kind: "TRANSACTION" }];
	await page.getByRole("button", { name: "Buscar agora" }).click();
	await expect(page.getByText("9 importados", { exact: true })).toBeVisible();
	await page.getByRole("button", { name: "Revisar 1 registro" }).click();
	await expect(page.getByRole("dialog")).toBeVisible();
	await page.getByRole("button", { exact: true, name: "Editar" }).click();
	const paymentDialog = page.getByRole("dialog").last();
	await expect(paymentDialog.getByRole("button", { exact: true, name: "Salvar" })).toBeDisabled();
	await paymentDialog.getByRole("combobox", { name: "Cartão para pagar" }).click();
	await page.getByRole("option", { name: "Cartão local" }).click();
	await expect(paymentDialog.getByRole("button", { exact: true, name: "Salvar" })).toBeEnabled();
	await paymentDialog.getByRole("button", { exact: true, name: "Descartar" }).click();
	await page.keyboard.press("Escape");
	reviews = [{ count: 1, importId: "card-review", kind: "PURCHASE" }];
	await page.getByRole("button", { name: "Buscar agora" }).click();
	await page.getByRole("button", { name: "Revisar 1 registro" }).click();
	await page.getByRole("button", { exact: true, name: "Editar" }).click();
	const purchaseDialog = page.getByRole("dialog").last();
	await expect(purchaseDialog.getByText("Complete os campos obrigatórios", { exact: false })).toBeVisible();
	await expect(purchaseDialog.getByRole("button", { exact: true, name: "Salvar" })).toBeDisabled();
	await expect(purchaseDialog.getByLabel("Fechamento da fatura", { exact: false })).toBeVisible();
	await expect(purchaseDialog.getByLabel("Vencimento da fatura", { exact: false })).toBeVisible();
	await purchaseDialog.getByRole("button", { exact: true, name: "Descartar" }).click();
	await page.keyboard.press("Escape");
	await page.setViewportSize({ height: 844, width: 390 });
	await expect(page.getByRole("heading", { exact: true, name: "Open Finance" })).toBeVisible();
	const noOverflow = await page.evaluate(() => document.documentElement.scrollWidth <= window.innerWidth);
	if (!noOverflow) throw new Error("Horizontal overflow on mobile");
	// The shell owns mobile scrolling. A capped nested viewport clipped the setup cards.
	await expect(page.locator("main [data-slot='scroll-area-viewport']")).toHaveCount(0);
	await page.screenshot({ fullPage: true, path: "/tmp/zaimu-open-finance-mobile.png" });
	await page.mouse.move(195, 500);
	await page.mouse.wheel(0, 10000);
	await expect
		.poll(() =>
			page.getByRole("button", { exact: true, name: "Desconectar integração" }).evaluate(element => {
				const bounds = element.getBoundingClientRect();
				const navigation = document.querySelector('[aria-label="Navegação móvel"]');
				return bounds.top >= 0 && bounds.bottom < (navigation?.getBoundingClientRect().top ?? 0);
			}),
		)
		.toBe(true);
	await page.screenshot({ fullPage: true, path: "/tmp/zaimu-open-finance-mobile-bottom.png" });
	const stored = await page.evaluate(() => JSON.stringify({ ...localStorage }));
	if (stored.includes("dummy-secret")) throw new Error("Secret persisted in browser storage");
	rejectSync = true;
	await page.getByRole("button", { name: "Buscar agora" }).click();
	await expect(
		page.getByText("Muitas solicitações. Aguarde um instante e tente novamente.", { exact: false }),
	).toBeVisible();
	await expect(page).toHaveURL(`${TARGET_URL}/settings/open-finance`);
	await page.getByRole("button", { exact: true, name: "Desconectar integração" }).click();
	await page
		.getByRole("button", {
			name: "Desconectar integração e apagar credenciais e vínculos? Histórico será preservado.",
		})
		.click();
	await expect(page.getByText("Valide credenciais na etapa anterior para adicionar conexões.")).toBeVisible();
	expect(errors).toEqual([]);
});
