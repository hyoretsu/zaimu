import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:55461";
export default defineConfig({
	outputDir: "/tmp/zaimu-money-browser-results",
	testDir: "./tests/browser",
	testMatch: "money-sizing.spec.ts",
	use: {
		baseURL,
		headless: false,
		launchOptions: { executablePath: process.env.MONEY_CHROMIUM_PATH },
	},
	webServer: {
		command: "bun run dev --host 127.0.0.1",
		env: { PORT: "55461", VITE_PUBLIC_WEB_URL: "" },
		reuseExistingServer: true,
		timeout: 120000,
		url: baseURL,
	},
	workers: 1,
});
