import { expect, test } from "@playwright/test";
for (const width of [390, 1280]) {
	test(`select and remove independent PDFs at ${width}px`, async ({ page, baseURL }) => {
		await page.setViewportSize({ height: 844, width });
		await page.route("**/*", route =>
			new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
		);
		await page.goto("/tests/browser/fixtures/import-files.html");
		await page.screenshot({ path: `/tmp/zaimu-import-files-${width}-empty.png` });
		await page.locator('input[type="file"]').setInputFiles([
			{ buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", name: "extrato-janeiro.pdf" },
			{ buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", name: "extrato-fevereiro.pdf" },
		]);
		await expect(page.getByRole("listitem")).toHaveCount(2);
		await page.screenshot({ path: `/tmp/zaimu-import-files-${width}-selected.png` });
		await page.getByRole("button", { name: "Remover extrato-janeiro.pdf" }).click();
		await expect(page.getByRole("listitem")).toHaveCount(1);
		await page
			.locator('input[type="file"]')
			.setInputFiles({ buffer: Buffer.from("invalid"), mimeType: "text/plain", name: "invalid.txt" });
		await expect(page.getByRole("alert")).toHaveText("Selecione apenas arquivos PDF.");
		await page.screenshot({ path: `/tmp/zaimu-import-files-${width}-error.png` });
	});
}

for (const dialogWidth of [390, 1280]) {
	test(`queued dialog reports partial failure and retries only failed PDF at ${dialogWidth}px`, async ({
		page,
		baseURL,
	}) => {
		await page.setViewportSize({ height: 844, width: dialogWidth });
		let uploads = 0;
		let polls = 0;
		const submitted: string[] = [];
		await page.route("**/*", async route => {
			const url = new URL(route.request().url());
			if (url.pathname === "/transaction-imports/batch") {
				uploads++;
				submitted.push(route.request().postDataBuffer()?.toString() ?? "");
				await route.fulfill({ json: { batchId: `batch-${uploads}` } });
			} else if (url.pathname.startsWith("/transaction-imports/batch/")) {
				polls++;
				const pending = polls === 1;
				const retry = uploads > 1;
				await route.fulfill({
					json: {
						batchId: `batch-${uploads}`,
						results: retry
							? [
									{
										error: null,
										fileName: "bad.pdf",
										ignoredCount: 0,
										importId: "retry",
										index: 0,
										status: "SUCCEEDED",
										success: true,
									},
								]
							: [
									{
										error: null,
										fileName: "good.pdf",
										ignoredCount: 0,
										importId: pending ? null : "good",
										index: 0,
										status: pending ? "RUNNING" : "SUCCEEDED",
										success: !pending,
									},
									{
										error: pending ? null : "PDF inválido",
										fileName: "bad.pdf",
										ignoredCount: 0,
										importId: null,
										index: 1,
										status: pending ? "QUEUED" : "FAILED",
										success: false,
									},
								],
						status: pending ? "RUNNING" : "COMPLETED",
					},
				});
			} else if (url.origin === baseURL) await route.continue();
			else await route.abort();
		});
		await page.goto("/tests/browser/fixtures/import-files.html?dialog");
		await page.locator('input[type="file"]').setInputFiles(
			["good.pdf", "bad.pdf"].map(name => ({
				buffer: Buffer.from("%PDF-1.4"),
				mimeType: "application/pdf",
				name,
			})),
		);
		await page.getByRole("button", { exact: true, name: "Importar extrato" }).click();
		await expect(page.getByRole("status")).toContainText("Processando arquivos");
		await page.screenshot({ path: `/tmp/zaimu-import-dialog-${dialogWidth}-processing.png` });
		await expect(page.getByRole("alert")).toContainText("bad.pdf: PDF inválido");
		await expect(page.getByRole("button", { name: "Remover good.pdf" })).toHaveCount(0);
		await page.screenshot({ path: `/tmp/zaimu-import-dialog-${dialogWidth}-partial.png` });
		await page.getByRole("button", { exact: true, name: "Importar extrato" }).click();
		await expect.poll(() => uploads).toBe(2);
		expect(submitted[1]).toContain('filename="bad.pdf"');
		expect(submitted[1]).not.toContain('filename="good.pdf"');
	});
}
