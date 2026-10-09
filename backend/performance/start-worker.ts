import { configurePerformanceEnvironment } from "./environment";

configurePerformanceEnvironment();
const entry = process.env.PERFORMANCE_WORKER_ENTRY ?? "../dist/worker.js";
await import(entry);
