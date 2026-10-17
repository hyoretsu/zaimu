import { realpathSync } from "node:fs";
import { defineConfig, mergeConfig } from "vite";
import base from "./vite.config";

export default defineConfig(env =>
	mergeConfig(typeof base === "function" ? base(env) : base, {
		cacheDir: "/tmp/zaimu-single-select-vite-cache",
		server: { fs: { allow: [import.meta.dirname, realpathSync("node_modules")] } },
	}),
);
