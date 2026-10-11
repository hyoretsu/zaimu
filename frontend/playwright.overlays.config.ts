import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:55451";
export default defineConfig({
	outputDir: "/tmp/zaimu-overlay-browser-results",
	testDir: "./tests/browser",
	testMatch: "overlay-dismissal.spec.ts",
	use: {
		baseURL,
		headless: true,
		launchOptions: { executablePath: process.env.OVERLAY_CHROMIUM_PATH },
		viewport: { height: 844, width: 390 },
	},
	webServer: {
		command: "bun run dev",
		env: { PORT: "55451", VITE_API_URL: "http://127.0.0.1:55452", VITE_PUBLIC_WEB_URL: "" },
		reuseExistingServer: true,
		timeout: 120000,
		url: baseURL,
	},
	workers: 1,
});
