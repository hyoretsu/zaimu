import { connect } from "node:http2";
import { importPKCS8, SignJWT } from "jose";
import webpush from "web-push";

export class PushConfigurationMissing extends Error {}
export class PushDestinationExpired extends Error {}
export interface PushMessage {
	title: string;
	body: string;
	url: string;
	tag: string;
}
export interface PushTarget {
	platform: string;
	address: string;
	credentials: Record<string, unknown>;
}

export async function sendPush(target: PushTarget, message: PushMessage) {
	if (target.platform === "WEB") {
		const publicKey = process.env.WEB_PUSH_PUBLIC_KEY,
			privateKey = process.env.WEB_PUSH_PRIVATE_KEY,
			subject = process.env.WEB_PUSH_SUBJECT;
		if (!publicKey || !privateKey || !subject)
			throw new PushConfigurationMissing("Web Push não configurado");
		try {
			await webpush.sendNotification(
				{ endpoint: target.address, keys: target.credentials as { auth: string; p256dh: string } },
				JSON.stringify(message),
				{ TTL: 3600, timeout: 15000, vapidDetails: { privateKey, publicKey, subject } },
			);
		} catch (error) {
			if (
				error &&
				typeof error === "object" &&
				"statusCode" in error &&
				[404, 410].includes(Number(error.statusCode))
			)
				throw new PushDestinationExpired();
			throw error;
		}
	} else if (target.platform === "ANDROID") {
		if (!process.env.FCM_SERVICE_ACCOUNT_JSON) throw new PushConfigurationMissing("FCM não configurado");
		const credentials = JSON.parse(process.env.FCM_SERVICE_ACCOUNT_JSON) as {
			private_key: string;
			client_email: string;
			project_id: string;
		};
		const assertion = await new SignJWT({ scope: "https://www.googleapis.com/auth/firebase.messaging" })
			.setProtectedHeader({ alg: "RS256" })
			.setIssuer(credentials.client_email)
			.setAudience("https://oauth2.googleapis.com/token")
			.setIssuedAt()
			.setExpirationTime("1h")
			.sign(await importPKCS8(credentials.private_key, "RS256"));
		const oauth = await fetch("https://oauth2.googleapis.com/token", {
			body: new URLSearchParams({
				assertion,
				grant_type: "urn:ietf:params:oauth:grant-type:jwt-bearer",
			}),
			method: "POST",
			signal: AbortSignal.timeout(15000),
		});
		if (!oauth.ok) throw new Error("Falha de autenticação FCM");
		const { access_token } = (await oauth.json()) as { access_token: string };
		const response = await fetch(
			`https://fcm.googleapis.com/v1/projects/${encodeURIComponent(credentials.project_id)}/messages:send`,
			{
				body: JSON.stringify({
					message: {
						android: { notification: { click_action: "ZAIMU_NOTIFICATION", tag: message.tag } },
						data: { tag: message.tag, url: message.url },
						notification: { body: message.body, title: message.title },
						token: target.address,
					},
				}),
				headers: { authorization: `Bearer ${access_token}`, "content-type": "application/json" },
				method: "POST",
				signal: AbortSignal.timeout(15000),
			},
		);
		if (!response.ok) {
			const error = (await response.json()) as { error?: { details?: Array<{ errorCode?: string }> } };
			if (error.error?.details?.some(detail => detail.errorCode === "UNREGISTERED"))
				throw new PushDestinationExpired();
			throw new Error("Falha no envio FCM");
		}
	} else if (target.platform === "IOS") {
		const key = process.env.APNS_PRIVATE_KEY,
			keyId = process.env.APNS_KEY_ID,
			team = process.env.APNS_TEAM_ID,
			topic = process.env.APNS_TOPIC;
		if (!key || !keyId || !team || !topic) throw new PushConfigurationMissing("APNs não configurado");
		const jwt = await new SignJWT({})
			.setProtectedHeader({ alg: "ES256", kid: keyId })
			.setIssuer(team)
			.setIssuedAt()
			.sign(await importPKCS8(key.replaceAll("\\n", "\n"), "ES256"));
		const sandbox = process.env.APNS_ENVIRONMENT !== "production";
		await new Promise<void>((resolve, reject) => {
			const connection = connect(
				sandbox ? "https://api.sandbox.push.apple.com" : "https://api.push.apple.com",
			);
			const finish = (error?: Error) => {
				connection.close();
				if (error) reject(error);
				else resolve();
			};
			connection.on("error", finish);
			connection.setTimeout(15000, () => {
				connection.destroy();
				reject(new Error("APNs timeout"));
			});
			const request = connection.request({
				":method": "POST",
				":path": `/3/device/${target.address}`,
				"apns-collapse-id": message.tag.slice(0, 64),
				"apns-push-type": "alert",
				"apns-topic": topic,
				authorization: `bearer ${jwt}`,
			});
			let status = 0;
			request.on("response", headers => {
				status = Number(headers[":status"]);
			});
			request.on("data", () => undefined);
			request.on("error", finish);
			request.on("end", () =>
				finish(
					status === 200
						? undefined
						: status === 410
							? new PushDestinationExpired()
							: new Error("Falha no envio APNs"),
				),
			);
			request.end(
				JSON.stringify({
					aps: { alert: { body: message.body, title: message.title }, sound: "default" },
					tag: message.tag,
					url: message.url,
				}),
			);
		});
	}
}
