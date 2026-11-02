import { defineConfig } from "@playwright/test";
export default defineConfig({
	expect: { timeout: 120000 },
	outputDir: "/tmp/zaimu-import-files-results",
	testDir: "./tests/browser",
	testMatch: "import-files.spec.ts",
	timeout: 240000,
	use: {
		baseURL: "http://127.0.0.1:55461",
		headless: process.env.IMPORT_FILES_HEADLESS === "true",
		launchOptions: { executablePath: process.env.IMPORT_FILES_CHROMIUM_PATH },
	},
	webServer: {
		command: "bunx --no-install vite --config vite.single-select.config.ts --configLoader runner",
		env: { PORT: "55461", VITE_PUBLIC_WEB_URL: "" },
		url: "http://127.0.0.1:55461",
	},
	workers: 1,
});
