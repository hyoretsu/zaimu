import Elysia from "elysia";
import { auth } from "./auth";
import { authSecondaryStorage } from "./secondary-storage";
import { getAuthSession } from "./session";

const isPublicRoute = (pathname: string) => pathname === "/health" || pathname.startsWith("/api/auth/");

export const AuthPlugin = new Elysia({ name: "AuthPlugin" })
	.mount(request =>
		request.method === "GET" && new URL(request.url).pathname === "/api/auth/get-session"
			? authSecondaryStorage.run(() => auth.handler(request))
			: authSecondaryStorage.mutate(() => auth.handler(request)),
	)
	.derive({ as: "global" }, async ({ request }) => ({
		authSession: isPublicRoute(new URL(request.url).pathname) ? null : await getAuthSession(request),
	}))
	.onBeforeHandle({ as: "global" }, ({ authSession, request, status }) => {
		if (isPublicRoute(new URL(request.url).pathname)) return;
		if (!authSession) return status(401, { error: "Não autenticado" });
	});
