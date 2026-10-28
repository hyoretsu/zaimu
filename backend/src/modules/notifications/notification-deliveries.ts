import { sendEmail } from "~/modules/auth/email";
import { queryRaw } from "~/shared/infra/sql";
import {
	PushConfigurationMissing,
	PushDestinationExpired,
	type PushTarget,
	sendPush,
} from "./push-providers";

export async function deliverNotifications(adapters = { sendEmail, sendPush }) {
	const deliveries = await queryRaw<{
		id: string;
		userId: string;
		transferId: string;
		event: string;
		channel: string;
		deviceId: string | null;
		attempts: number;
	}>(
		`WITH due AS (SELECT "id" FROM "NotificationDelivery" WHERE "status"='PENDING' AND "nextAttemptAt"<=now() AND ("lockedUntil" IS NULL OR "lockedUntil"<now()) ORDER BY "createdAt" LIMIT 20 FOR UPDATE SKIP LOCKED) UPDATE "NotificationDelivery" delivery SET "lockedUntil"=now()+interval '2 minutes',"attempts"="attempts"+1 FROM due WHERE delivery."id"=due."id" RETURNING delivery.*`,
	);
	for (const delivery of deliveries) {
		try {
			const [context] = await queryRaw<{ status: string; email: string }>(
				`SELECT invitation."status",recipient."email" FROM "AccountTransfer" invitation JOIN "user" recipient ON recipient."id"=$2 WHERE invitation."id"=$1`,
				[delivery.transferId, delivery.userId],
			);
			if (!context || context.status !== delivery.event) {
				await complete(delivery.id, "SKIPPED");
				continue;
			}
			const url = `${(process.env.PUBLIC_WEB_URL ?? "http://localhost:5173").replace(/\/$/, "")}/account-transfers?transfer=${encodeURIComponent(delivery.transferId)}`;
			const title =
				delivery.event === "PENDING"
					? "Convite de transferência de contas"
					: delivery.event === "ACCEPTED"
						? "Transferência de contas concluída"
						: "Convite de transferência recusado";
			const body =
				delivery.event === "PENDING"
					? "Você recebeu um convite. Abra o Zaimu para revisar antes de aceitar."
					: "Abra o Zaimu para consultar o resultado do convite.";
			if (delivery.channel === "EMAIL")
				await adapters.sendEmail({
					actionLabel: "Ver transferência",
					preview: body,
					subject: title,
					to: context.email,
					url,
				});
			else {
				const [device] = await queryRaw<
					PushTarget & Record<string, unknown> & { userId: string; enabled: boolean }
				>(`SELECT * FROM "PushDevice" WHERE "id"=$1`, [delivery.deviceId]);
				if (!device?.enabled || device.userId !== delivery.userId) {
					await complete(delivery.id, "SKIPPED");
					continue;
				}
				await adapters.sendPush(device, { body, tag: `transfer:${delivery.transferId}`, title, url });
			}
			await complete(delivery.id, "SENT");
		} catch (error) {
			if (error instanceof PushDestinationExpired) {
				await queryRaw(`UPDATE "PushDevice" SET "enabled"=false WHERE "id"=$1 AND "userId"=$2`, [
					delivery.deviceId,
					delivery.userId,
				]);
				await complete(delivery.id, "SKIPPED");
			} else
				await queryRaw(
					`UPDATE "NotificationDelivery" SET "lockedUntil"=NULL,"nextAttemptAt"=now()+($2*interval '1 second'),"lastError"=$3,"updatedAt"=now() WHERE "id"=$1`,
					[
						delivery.id,
						error instanceof PushConfigurationMissing
							? 3600
							: Math.min(3600, 30 * 2 ** Math.min(delivery.attempts, 7)),
						error instanceof PushConfigurationMissing
							? "Canal não configurado"
							: "Falha no canal de notificação",
					],
				);
		}
	}
}
async function complete(id: string, status: string) {
	await queryRaw(
		`UPDATE "NotificationDelivery" SET "status"=$2,"lockedUntil"=NULL,"lastError"=NULL,"updatedAt"=now() WHERE "id"=$1`,
		[id, status],
	);
}
