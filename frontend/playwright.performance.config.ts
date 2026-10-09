import { defineConfig } from "@playwright/test";

const baseURL = "http://127.0.0.1:5173";
export default defineConfig({
	outputDir: "/tmp/zaimu-browser-performance",
	testDir: "./tests/performance",
	timeout: 1200000,
	use: {
		actionTimeout: 15000,
		baseURL,
		headless: false,
		launchOptions: { executablePath: process.env.PERFORMANCE_CHROMIUM_PATH },
		trace: "retain-on-failure",
	},
	webServer: {
		command: "bun x --no-install vite preview --host 127.0.0.1 --port 5173 --strictPort",
		reuseExistingServer: false,
		timeout: 60000,
		url: baseURL,
	},
	workers: 1,
});
