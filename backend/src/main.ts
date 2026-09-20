import { startReferenceRateWorker } from "./modules/reference-rates/infra";
import { server } from "./server";
import { app } from "./shared/infra/elysia";

server.listen(process.env.PORT || 3333);
startReferenceRateWorker();

console.log(`Zaimu API running at ${app.server?.hostname}:${app.server?.port}`);
