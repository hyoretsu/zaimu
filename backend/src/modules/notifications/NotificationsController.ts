import Elysia, { t } from "elysia";
import { requireUserId } from "~/modules/auth";
import { HttpException } from "~/shared/errors";
import { queryRaw } from "~/shared/infra/sql";

export const NotificationsController = new Elysia({ prefix: "/notifications" })
	.get(
		"/push-config",
		() => ({
			android:
				process.env.FCM_ANDROID_APP_ID &&
				process.env.FCM_ANDROID_API_KEY &&
				process.env.FCM_PROJECT_ID &&
				process.env.FCM_SENDER_ID
					? {
							apiKey: process.env.FCM_ANDROID_API_KEY,
							appId: process.env.FCM_ANDROID_APP_ID,
							projectId: process.env.FCM_PROJECT_ID,
							senderId: process.env.FCM_SENDER_ID,
						}
					: null,
			publicKey: process.env.WEB_PUSH_PUBLIC_KEY ?? null,
		}),
		{
			detail: { operationId: "getNotificationsPushConfig" },
			response: t.Object({
				android: t.Nullable(
					t.Object({
						apiKey: t.String(),
						appId: t.String(),
						projectId: t.String(),
						senderId: t.String(),
					}),
				),
				publicKey: t.Nullable(t.String()),
			}),
		},
	)
	.post(
		"/devices",
		async ({ request, body }) => {
			const userId = await requireUserId(request);
			if (body.platform === "WEB") {
				const url = new URL(body.address);
				// Push endpoints are user supplied: restrict to established providers and standard HTTPS.
				if (
					url.protocol !== "https:" ||
					url.port ||
					url.username ||
					url.password ||
					!["fcm.googleapis.com", "updates.push.services.mozilla.com", "web.push.apple.com"].some(
						host => url.hostname === host || url.hostname.endsWith(`.${host}`),
					)
				)
					throw new HttpException("Destino push inválido", 400);
				if (!body.credentials?.auth || !body.credentials?.p256dh)
					throw new HttpException("Assinatura Web Push inválida", 400);
			} else if (
				!/^[A-Za-z0-9_:.-]+$/.test(body.address) ||
				(body.platform === "IOS" && !/^[a-f0-9]{64}$/i.test(body.address))
			)
				throw new HttpException("Token push inválido", 400);
			const [device] = await queryRaw<{ id: string }>(
				`INSERT INTO "PushDevice" ("id","userId","platform","address","credentials") VALUES ($1,$2,$3,$4,$5::json) ON CONFLICT ("address") DO UPDATE SET "userId"=EXCLUDED."userId","platform"=EXCLUDED."platform","credentials"=EXCLUDED."credentials","enabled"=true,"updatedAt"=now() RETURNING "id"`,
				[
					crypto.randomUUID(),
					userId,
					body.platform,
					body.address,
					JSON.stringify(body.credentials ?? {}),
				],
			);
			return device!;
		},
		{
			body: t.Object({
				address: t.String({ maxLength: 4096, minLength: 1 }),
				credentials: t.Optional(
					t.Object({ auth: t.String({ maxLength: 512 }), p256dh: t.String({ maxLength: 512 }) }),
				),
				platform: t.Union([t.Literal("WEB"), t.Literal("ANDROID"), t.Literal("IOS")]),
			}),
			detail: { operationId: "postNotificationsDevices" },
			response: t.Object({ id: t.String() }),
		},
	)
	.delete(
		"/devices/:id",
		async ({ request, params }) => {
			await queryRaw(
				`UPDATE "PushDevice" SET "enabled"=false,"updatedAt"=now() WHERE "id"=$1 AND "userId"=$2`,
				[params.id, await requireUserId(request)],
			);
			return { success: true };
		},
		{
			detail: { operationId: "deleteNotificationsDevicesById" },
			params: t.Object({ id: t.String() }),
			response: t.Object({ success: t.Boolean() }),
		},
	);
