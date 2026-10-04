import Elysia from "elysia";
import { getQueryMetrics } from "sql";
import { HttpException } from "~/shared/errors";
import { instrumentHttp } from "../performance/http-metrics";

export const GlobalPlugin = new Elysia({ name: "GlobalPlugin" })
	.wrap(
		handler =>
			instrumentHttp(handler as unknown as (request: Request) => Response | Promise<Response>) as never,
	)
	.onAfterHandle(({ route }) => {
		const metrics = getQueryMetrics();
		if (metrics) metrics.route = route;
	})
	.error({ HttpException })
	.onError(({ code, error, request, set }) => {
		if (new URL(request.url).pathname.startsWith("/open-finance")) {
			set.status =
				code === "HttpException" ? (error as HttpException).statusCode : code === "VALIDATION" ? 422 : 500;
			return {
				error:
					code === "HttpException"
						? error.message
						: code === "VALIDATION"
							? "Dados Open Finance inválidos"
							: "Não foi possível concluir a operação Open Finance",
			};
		}
		if (code === "HttpException") {
			set.status = error.statusCode;
			return { error: error.message };
		}

		console.error(error);
		return { error: "Internal Server Error" };
	})
	.as("global");
