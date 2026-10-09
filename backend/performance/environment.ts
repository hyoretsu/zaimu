import { freezePerformanceDate } from "./clock";
import { createPerformanceFetch } from "./local-fetch";

export function configurePerformanceEnvironment() {
	freezePerformanceDate();
	// Never inherit shared endpoints from .env or the caller.
	Object.assign(process.env, {
		BETTER_AUTH_SECRET: "zaimu-local-performance-secret-at-least-32-characters",
		BETTER_AUTH_URL: "http://127.0.0.1:3335",
		DATABASE_URL: "postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance",
		NODE_ENV: "test",
		PERFORMANCE_METRICS_HEADERS: "true",
		PORT: "3335",
		PUBLIC_WEB_URL: "http://127.0.0.1:5173",
		RABBITMQ_CONSUMER_PREFETCH: "1",
		RABBITMQ_URL: "amqp://performance:performance-local@127.0.0.1:56795",
		REDIS_URL: "redis://127.0.0.1:6395",
		SERVICE_NAMESPACE: "zaimu_performance",
	});
	globalThis.fetch = createPerformanceFetch(globalThis.fetch);
}
