import { initialize } from "@zaimu/observability/sdk";

export type { ComparisonJob } from "./comparison-worker-app";
const scope = globalThis as unknown as Worker;
let pending: MessageEvent | undefined;
// Messages can arrive while the application module is loading asynchronously.
scope.onmessage = /* @otel-ignore */ event => {
	pending ??= event;
};
initialize("worker", "zaimu");
await import("./comparison-worker-app");
const receive = scope.onmessage;
if (pending) receive?.call(scope, pending);
