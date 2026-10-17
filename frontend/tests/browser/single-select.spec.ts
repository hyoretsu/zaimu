import { expect, test } from "@playwright/test";

const account = { label: "Conta Inter", value: "inter" };
const other = { label: "Conta Nubank", value: "nubank" };

test.beforeEach(async ({ page, baseURL }) => {
	await page.route("**/*", route =>
		new URL(route.request().url()).origin === baseURL ? route.continue() : route.abort(),
	);
	await page.goto("/tests/browser/fixtures/single-select.html");
	await expect(page.getByRole("combobox")).toBeVisible();
});

test("selects only enabled option and updates controlled form value", async ({ page }) => {
	await page.evaluate(account => (window as any).configureSelect({ options: [account] }), account);
	await expect(page.getByRole("combobox")).toContainText(account.label);
	await expect(page.getByTestId("value")).toHaveText(account.value);
	await expect(page.getByTestId("changes")).toHaveText("1");
});

test("selects after loading and dependency changes", async ({ page }) => {
	await page.evaluate(
		account => (window as any).configureSelect({ isLoading: true, options: [account] }),
		account,
	);
	await expect(page.getByTestId("changes")).toHaveText("0");
	await page.evaluate(account => (window as any).configureSelect({ options: [account] }), account);
	await expect(page.getByTestId("value")).toHaveText(account.value);
	await page.evaluate(other => (window as any).configureSelect({ options: [other], value: "inter" }), other);
	await expect(page.getByTestId("value")).toHaveText(other.value);
});

test("ignores disabled options and blocked controls", async ({ page }) => {
	for (const guard of [{ disabled: true }, { isLoading: true }, { error: "Falha" }, { values: [] }]) {
		await page.evaluate(
			({ account, guard }) => (window as any).configureSelect({ ...guard, options: [account] }),
			{ account, guard },
		);
		await expect(page.getByTestId("changes")).toHaveText("0");
	}
	await page.evaluate(
		account => (window as any).configureSelect({ options: [{ ...account, disabled: true }] }),
		account,
	);
	await expect(page.getByTestId("changes")).toHaveText("0");
	await page.evaluate(
		({ account, other }) =>
			(window as any).configureSelect({ options: [account, { ...other, disabled: true }] }),
		{ account, other },
	);
	await expect(page.getByTestId("value")).toHaveText(account.value);
});

test("preserves valid selections and counts special options", async ({ page }) => {
	await page.evaluate(
		account => (window as any).configureSelect({ options: [account], value: account.value }),
		account,
	);
	await expect(page.getByTestId("changes")).toHaveText("0");
	await page.evaluate(
		account =>
			(window as any).configureSelect({
				options: [{ label: "Sem conta", special: true, value: "" }, account],
			}),
		account,
	);
	await expect(page.getByTestId("changes")).toHaveText("0");
});

test("search with one result never selects automatically", async ({ page }) => {
	await page.evaluate(
		({ account, other }) => (window as any).configureSelect({ options: [account, other] }),
		{ account, other },
	);
	await page.getByRole("combobox").click();
	await page.getByPlaceholder("Buscar conta").fill("Inter");
	await expect(page.getByRole("option")).toHaveCount(1);
	await expect(page.getByTestId("changes")).toHaveText("0");
});

test("statement import submits the account selected after choosing institution", async ({ page }) => {
	await page.goto("/tests/browser/fixtures/single-select.html?import");
	await page.getByRole("combobox", { exact: true, name: "Instituição" }).click();
	await page.getByRole("option", { exact: true, name: "Inter" }).click();
	await expect(page.getByRole("combobox", { name: "Conta que receberá as transações" })).toContainText(
		"Inter",
	);
	await page
		.locator('input[type="file"]')
		.setInputFiles({ buffer: Buffer.from("%PDF-1.4"), mimeType: "application/pdf", name: "statement.pdf" });
	await page.getByRole("button", { exact: true, name: "Importar extrato" }).click();
	await expect
		.poll(() => page.evaluate(() => (window as any).submittedImport))
		.toEqual({ financialAccountId: "account-inter", provider: "INTER" });
});
