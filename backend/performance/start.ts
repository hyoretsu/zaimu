import { freezePerformanceDate } from "./clock";

freezePerformanceDate();
// This launcher deliberately ignores shared .env endpoints and credentials.
process.env.NODE_ENV = "test";
process.env.PORT = "3335";
process.env.DATABASE_URL = "postgresql://performance:performance-local@127.0.0.1:55495/zaimu_performance";
process.env.REDIS_URL = "redis://127.0.0.1:6395";
process.env.RABBITMQ_URL = "amqp://performance:performance-local@127.0.0.1:56795";
process.env.SERVICE_NAMESPACE = "zaimu_performance";
process.env.BETTER_AUTH_SECRET = "zaimu-local-performance-secret-at-least-32-characters";
process.env.BETTER_AUTH_URL = "http://127.0.0.1:3335";
process.env.PUBLIC_WEB_URL = "http://localhost:5173";
process.env.PERFORMANCE_METRICS_HEADERS = "true";
const entry = process.env.PERFORMANCE_API_ENTRY ?? "../dist/main.js";
await import(entry);
