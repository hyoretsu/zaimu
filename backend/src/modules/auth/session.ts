import { measureOperation, withQueryKind } from "sql";
import { HttpException } from "~/shared/errors";
import { type AuthSession, auth } from "./auth";

const requestSessions = new WeakMap<Request, Promise<AuthSession | null>>();

export const getAuthSession = (request: Request) => {
	const cached = requestSessions.get(request);
	if (cached) return cached;

	const session = withQueryKind("auth", () =>
		measureOperation("auth", () =>
			auth.api.getSession({ headers: request.headers, query: { disableRefresh: true } }),
		),
	);
	requestSessions.set(request, session);
	return session;
};

export const requireUserId = async (request: Request) => {
	const session = await getAuthSession(request);
	if (!session) throw new HttpException("Não autenticado", 401);
	return session.user.id;
};
