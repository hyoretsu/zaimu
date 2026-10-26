import { defineConfig, devices } from "@playwright/test";
const port = 55561;
export default defineConfig({
	outputDir: "/tmp/zaimu-toast-browser-results",
	projects: [
		{ name: "desktop", use: { ...devices["Desktop Chrome"] } },
		{ name: "mobile", use: { ...devices["Pixel 7"] } },
	],
	testDir: "./tests/browser",
	testMatch: "toasts.spec.ts",
	use: {
		baseURL: `http://127.0.0.1:${port}`,
		headless: !process.env.DISPLAY,
		launchOptions: {
			executablePath:
				process.env.PLAYWRIGHT_CHROMIUM_EXECUTABLE_PATH ?? "/usr/bin/google-chrome-stable",
		},
	},
	webServer: {
		command: `bunx vite --host 127.0.0.1 --port ${port} --strictPort`,
		reuseExistingServer: false,
		url: `http://127.0.0.1:${port}/tests/browser/fixtures/toasts.html`,
	},
	workers: 1,
});
