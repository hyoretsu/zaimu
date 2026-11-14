import { installPerformanceClock, PERFORMANCE_REFERENCE_DATE } from "./clock";
import {
	PERFORMANCE_API_ORIGIN,
	PERFORMANCE_API_PORT,
	PERFORMANCE_DATABASE_URL,
	PERFORMANCE_RABBITMQ_URL,
	PERFORMANCE_REDIS_URL,
} from "./endpoints";
import { createPerformanceFetch } from "./local-fetch";

export function configurePerformanceEnvironment() {
	installPerformanceClock();
	// Never inherit shared endpoints from .env or the caller.
	Object.assign(process.env, {
		BETTER_AUTH_SECRET: "zaimu-local-performance-secret-at-least-32-characters",
		BETTER_AUTH_URL: PERFORMANCE_API_ORIGIN,
		DATABASE_URL: `${PERFORMANCE_DATABASE_URL}?options=${encodeURIComponent(`-c zaimu.business_date=${PERFORMANCE_REFERENCE_DATE}`)}`,
		NODE_ENV: "test",
		PERFORMANCE_METRICS_HEADERS: "true",
		PORT: String(PERFORMANCE_API_PORT),
		PUBLIC_WEB_URL: "http://127.0.0.1:5173",
		RABBITMQ_CONSUMER_PREFETCH: "1",
		RABBITMQ_URL: PERFORMANCE_RABBITMQ_URL,
		REDIS_URL: PERFORMANCE_REDIS_URL,
		SERVICE_NAMESPACE: "zaimu_performance",
	});
	globalThis.fetch = createPerformanceFetch(globalThis.fetch);
}
