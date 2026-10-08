import { defineConfig } from "@playwright/test";

const baseURL = process.env.CURRENCY_BROWSER_URL ?? "http://127.0.0.1:55441";
if (!["127.0.0.1", "localhost"].includes(new URL(baseURL).hostname))
	throw new Error("Currency browser tests require a local server");
export default defineConfig({
	expect: { timeout: 120000 },
	outputDir: "/tmp/zaimu-currency-browser-results",
	testDir: "./tests/browser",
	testMatch: "currency-preferences.spec.ts",
	timeout: 240000,
	use: {
		baseURL,
		headless: process.env.CURRENCY_HEADLESS === "true",
		launchOptions: { executablePath: process.env.CURRENCY_CHROMIUM_PATH },
		viewport: { height: 900, width: 1280 },
	},
	webServer: {
		command: "bun run dev",
		env: { PORT: new URL(baseURL).port, VITE_API_URL: "http://127.0.0.1:55442", VITE_PUBLIC_WEB_URL: "" },
		reuseExistingServer: true,
		timeout: 120000,
		url: baseURL,
	},
	workers: 1,
});
