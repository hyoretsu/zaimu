import cors from "@elysiajs/cors";
import Elysia from "elysia";
import { AuthPlugin } from "~/modules/auth";
import { DataConsistencyPlugin } from "./data-consistency";
import { GlobalPlugin } from "./global";
import { OpenAPI } from "./openapi";

const trustedOrigins = [
	process.env.PUBLIC_WEB_URL ?? "http://localhost:5173",
	"tauri://localhost",
	"http://tauri.localhost",
	"https://tauri.localhost",
];

export const app = new Elysia()
	.use(cors({ credentials: true, origin: trustedOrigins }))
	.use(GlobalPlugin)
	.use(AuthPlugin)
	.use(DataConsistencyPlugin)
	.use(OpenAPI)
	.get("/health", () => ({ status: "ok" }));
