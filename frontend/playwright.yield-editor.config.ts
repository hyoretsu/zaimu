import { defineConfig } from "@playwright/test";
export default defineConfig({
	testDir: "./tests/browser",
	testMatch: "yield-editor.spec.ts",
	timeout: 120000,
	use: {
		baseURL: "http://127.0.0.1:55462",
		headless: true,
		launchOptions: { executablePath: process.env.YIELD_CHROMIUM_PATH },
	},
	webServer: {
		command: "bunx --no-install vite --config vite.single-select.config.ts --port 55462",
		url: "http://127.0.0.1:55462",
	},
});
