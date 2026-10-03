import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import {
	addConnection,
	disconnect,
	discoverConnections,
	getConfiguration,
	saveBinding,
	saveCredentials,
} from "../application/configuration";
import { startSync, syncStatus } from "../application/sync";
import {
	BindingDTO,
	ConfigurationReturn,
	CredentialsDTO,
	DiscoveryReturn,
	SuccessReturn,
	SyncStartReturn,
	SyncStatusReturn,
} from "./OpenFinanceDTO";
export const OpenFinanceController = new Elysia({ prefix: "/open-finance" })
	.get("/", async ({ request }) => getConfiguration(await requireUserId(request)), {
		response: ConfigurationReturn,
	})
	.put(
		"/credentials",
		async ({ request, body }) => {
			await saveCredentials(await requireUserId(request), body);
			return { success: true };
		},
		{ body: CredentialsDTO, response: SuccessReturn },
	)
	.post("/connections/discover", async ({ request }) => discoverConnections(await requireUserId(request)), {
		response: DiscoveryReturn,
	})
	.post(
		"/connections",
		async ({ request, body }) => addConnection(await requireUserId(request), body.itemId),
		{ body: t.Object({ itemId: t.String({ maxLength: 200, minLength: 1 }) }), response: ConfigurationReturn },
	)
	.put(
		"/connections/:id/bindings",
		async ({ request, params, body }) => {
			await saveBinding(await requireUserId(request), params.id, body);
			return { success: true };
		},
		{ body: BindingDTO, response: SuccessReturn },
	)
	.delete(
		"/connections/:id",
		async ({ request, params }) => {
			await disconnect(await requireUserId(request), params.id);
			return { success: true };
		},
		{ response: SuccessReturn },
	)
	.delete(
		"/",
		async ({ request }) => {
			await disconnect(await requireUserId(request));
			return { success: true };
		},
		{ response: SuccessReturn },
	)
	.post("/sync", async ({ request, body }) => startSync(await requireUserId(request), body.force), {
		body: t.Object({ force: t.Optional(t.Boolean()) }),
		response: SyncStartReturn,
	})
	.get("/sync", async ({ request, query }) => syncStatus(await requireUserId(request), query.runId), {
		query: t.Object({ runId: t.Optional(t.String({ maxLength: 36 })) }),
		response: SyncStatusReturn,
	});
