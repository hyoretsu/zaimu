import { initialize } from "@zaimu/observability/sdk";
initialize("worker", "zaimu");
await import("./worker-app");
