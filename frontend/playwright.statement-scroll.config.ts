import { defineConfig } from "@playwright/test";
export default defineConfig({
	expect: { timeout: 120000 },
	outputDir: "/tmp/zaimu-statement-scroll-results",
	testDir: "./tests/browser",
	testMatch: "statement-scroll.spec.ts",
	timeout: 240000,
	use: {
		baseURL: "http://127.0.0.1:55461",
		headless: process.env.STATEMENT_SCROLL_HEADLESS === "true",
		launchOptions: { executablePath: process.env.STATEMENT_SCROLL_CHROMIUM_PATH },
	},
	webServer: {
		command: "bunx --no-install vite --config vite.single-select.config.ts --configLoader runner",
		env: { PORT: "55461", VITE_PUBLIC_WEB_URL: "" },
		url: "http://127.0.0.1:55461",
	},
	workers: 1,
});
