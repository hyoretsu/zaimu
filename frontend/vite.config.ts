import "dotenv/config";
import { resolve } from "node:path";
import tailwindcss from "@tailwindcss/vite";
import { TanStackRouterVite } from "@tanstack/router-plugin/vite";
import react from "@vitejs/plugin-react";
import { defineConfig } from "vite";

const host = process.env.TAURI_DEV_HOST || "0.0.0.0";
const port = Number(process.env.PORT || 5173);

const publicWebUrl = process.env.VITE_PUBLIC_WEB_URL ? new URL(process.env.VITE_PUBLIC_WEB_URL) : undefined;

// Vite owns the local dev-server port. The reverse proxy terminates TLS on 443,
// so only the browser-facing HMR connection uses the public HTTPS port.
const hmr = publicWebUrl
	? {
			clientPort: Number(publicWebUrl.port || (publicWebUrl.protocol === "https:" ? 443 : 80)),
			host: publicWebUrl.hostname,
			protocol: publicWebUrl.protocol === "https:" ? "wss" : "ws",
		}
	: undefined;

const resilientHmrPlugin = {
	name: "resilient-vite-hmr",
	transformIndexHtml: {
		handler: (html: string) =>
			html.replace("<head>", '<head><script type="module" src="/src/dev/resilient-vite-hmr.ts"></script>'),
		order: "post" as const,
	},
};

export default defineConfig(({ command }) => ({
	build: {
		minify: process.env.TAURI_ENV_DEBUG ? false : "esbuild",
		sourcemap: !!process.env.TAURI_ENV_DEBUG,
		target: "es2022",
	},
	clearScreen: false,
	envPrefix: ["VITE_", "TAURI_"],
	plugins: [
		...(command === "serve" ? [resilientHmrPlugin] : []),
		TanStackRouterVite({ autoCodeSplitting: true, routeFileIgnorePattern: "^components$" }),
		react(),
		tailwindcss(),
	],
	resolve: {
		alias: {
			"@": resolve(import.meta.dirname, "./src"),
		},
	},
	server: {
		allowedHosts: ["vite.hyoretsu.com", publicWebUrl?.hostname].filter((hostname): hostname is string =>
			Boolean(hostname),
		),
		hmr,
		host,
		port,
		strictPort: true,
		watch: {
			ignored: ["**/src-tauri/**"],
		},
	},
}));
