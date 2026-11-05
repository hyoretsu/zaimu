import { server } from "./server";
import { app } from "./shared/infra/elysia";

server.listen(process.env.PORT || 3333);
console.log(`Zaimu API running at ${app.server?.hostname}:${app.server?.port}`);
