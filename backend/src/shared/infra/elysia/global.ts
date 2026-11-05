import { startDependency } from "@zaimu/observability";
import { instrumentRequest, setHttpRoute } from "@zaimu/observability/http";
import Elysia from "elysia";
import { getQueryMetrics } from "sql";
import { HttpException } from "~/shared/errors";
import { instrumentHttp } from "../performance/http-metrics";

export const GlobalPlugin = new Elysia({ name: "GlobalPlugin" })
	.wrap(
		handler =>
			instrumentRequest(
				instrumentHttp(handler as unknown as (request: Request) => Response | Promise<Response>),
			) as never,
	)
	.onAfterHandle(({ route }) => {
		setHttpRoute(route);
		const metrics = getQueryMetrics();
		if (metrics) metrics.route = route;
	})

	.trace(
		({
			context: requestContext,
			onParse,
			onTransform,
			onBeforeHandle,
			onHandle,
			onMapResponse,
			onError,
			onAfterResponse,
		}) => {
			let finishValidation: ((failed?: boolean) => void) | undefined;
			const closeValidation = (failed = false) => {
				finishValidation?.(failed);
				finishValidation = undefined;
			};
			onParse(({ onStop }) => {
				setHttpRoute(requestContext.route);
				const finish = startDependency("http.parse");
				onStop(({ error }) => finish(Boolean(error)));
			});
			onTransform(({ onStop }) => {
				onStop(({ error }) => {
					if (!error) finishValidation = startDependency("http.validation");
				});
			});
			onBeforeHandle(({ onStop }) => {
				closeValidation();
				setHttpRoute(requestContext.route);
				const finish = startDependency("http.authentication");
				onStop(({ error }) => finish(Boolean(error)));
			});
			onHandle(({ onStop }) => {
				closeValidation();
				const finish = startDependency("http.handler");
				onStop(({ error }) => finish(Boolean(error)));
			});
			onMapResponse(({ onStop }) => {
				const finish = startDependency("http.serialization");
				onStop(({ error }) => finish(Boolean(error)));
			});
			onError(() => {
				closeValidation(true);
				setHttpRoute(requestContext.route);
			});
			onAfterResponse(() => closeValidation());
		},
	)
	.error({ HttpException })
	.onError(({ code, error, request, set }) => {
		if (new URL(request.url).pathname.startsWith("/open-finance")) {
			set.status =
				code === "HttpException"
					? (error as HttpException).statusCode
					: code === "VALIDATION"
						? 422
						: 500;
			return {
				error:
					code === "HttpException"
						? error.message
						: code === "VALIDATION"
							? "Dados Open Finance inválidos"
							: "Não foi possível concluir a operação Open Finance",
			};
		}
		if (error && typeof error === "object" && "code" in error && error.code === "42501") {
			set.status = 409;
			return {
				error: "Titularidade alterada ou histórico separado protegido. Atualize os dados antes de continuar.",
			};
		}
		if (code === "HttpException") {
			set.status = error.statusCode;
			return { error: error.message };
		}

		console.error(
			JSON.stringify({
				name: error instanceof Error ? error.name : "UnknownError",
				...(process.env.NODE_ENV !== "production" && error instanceof Error
					? {
							databaseCode: "code" in error ? error.code : undefined,
							message: error.message,
						}
					: {}),
				requestId: getQueryMetrics()?.requestId,
				stack: (error instanceof Error ? error.stack : undefined)
					?.split("\n")
					.filter(frame => /^\s+at /.test(frame))
					.join("\n"),
				type: "http_error",
			}),
		);
		set.status = code === "VALIDATION" ? 422 : code === "NOT_FOUND" ? 404 : 500;
		return { error: "Internal Server Error" };
	})
	.as("global");
