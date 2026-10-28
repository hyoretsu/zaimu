import { addPluginListener, invoke, isTauri } from "@tauri-apps/api/core";
import client from "./api/client-api";
import { getCurrentCacheIdentity } from "./query-cache";

let registered: { id: string; identity: string } | undefined;
export async function disablePushNotifications() {
	const saved = localStorage.getItem("zaimu-push-device");
	const device =
		registered ?? (saved ? (JSON.parse(saved) as { id: string; identity: string }) : undefined);
	registered = undefined;
	localStorage.removeItem("zaimu-push-device");
	if (device && device.identity === getCurrentCacheIdentity())
		await client({ method: "DELETE", url: `/notifications/devices/${encodeURIComponent(device.id)}` });
	if (!isTauri() && "serviceWorker" in navigator) {
		const registration = await navigator.serviceWorker.getRegistration("/");
		await (await registration?.pushManager.getSubscription())?.unsubscribe();
	}
}
async function persistDevice(
	platform: "WEB" | "ANDROID" | "IOS",
	address: string,
	credentials?: { auth: string; p256dh: string },
	expectedIdentity = getCurrentCacheIdentity(),
) {
	const identity = getCurrentCacheIdentity();
	if (!identity?.startsWith("user:") || identity !== expectedIdentity) return;
	const result = await client<{ id: string }>({
		data: { address, credentials, platform },
		method: "POST",
		url: "/notifications/devices",
	});
	if (identity === getCurrentCacheIdentity()) {
		registered = { id: result.data.id, identity };
		localStorage.setItem("zaimu-push-device", JSON.stringify(registered));
	}
}
export async function enablePushNotifications() {
	const expectedIdentity = getCurrentCacheIdentity();
	const config = (
		await client<{
			publicKey: string | null;
			android: { appId: string; apiKey: string; projectId: string; senderId: string } | null;
		}>({ method: "GET", url: "/notifications/push-config" })
	).data;
	if (expectedIdentity !== getCurrentCacheIdentity()) return;
	if (isTauri()) {
		const device = await invoke<{ platform: "ANDROID" | "IOS"; address: string }>(
			"plugin:push|register",
			{ android: config.android },
		);
		await persistDevice(device.platform, device.address, undefined, expectedIdentity);
		return;
	}
	if (!("serviceWorker" in navigator) || !("PushManager" in window))
		throw new Error("Este navegador não oferece Web Push. Use aplicativo ou navegador compatível.");
	if (!config.publicKey) throw new Error("Notificações push ainda não foram configuradas no servidor.");
	if ((await Notification.requestPermission()) !== "granted")
		throw new Error("Permissão de notificações não concedida. Revise permissões do dispositivo.");
	const registration = await navigator.serviceWorker.register("/push-sw.js", { scope: "/" });
	await navigator.serviceWorker.ready;
	const padding = "=".repeat((4 - (config.publicKey.length % 4)) % 4);
	const decoded = atob((config.publicKey + padding).replaceAll("-", "+").replaceAll("_", "/"));
	const key = Uint8Array.from(decoded, character => character.charCodeAt(0));
	const subscription =
		(await registration.pushManager.getSubscription()) ??
		(await registration.pushManager.subscribe({ applicationServerKey: key, userVisibleOnly: true }));
	const json = subscription.toJSON();
	await persistDevice(
		"WEB",
		subscription.endpoint,
		json.keys as { auth: string; p256dh: string },
		expectedIdentity,
	);
}
export async function initializePushListeners(onOpen: (url: string) => void) {
	const expectedIdentity = getCurrentCacheIdentity();
	const saved = localStorage.getItem("zaimu-push-device");
	if (saved) {
		try {
			if (JSON.parse(saved).id) void enablePushNotifications().catch(() => undefined);
		} catch {
			localStorage.removeItem("zaimu-push-device");
		}
	}

	if (isTauri()) {
		const token = await addPluginListener<{ platform: "ANDROID" | "IOS"; address: string }>(
			"push",
			"token",
			device =>
				void persistDevice(device.platform, device.address, undefined, expectedIdentity).catch(
					() => undefined,
				),
		);
		const opened = await addPluginListener<{ url: string }>("push", "open", event => onOpen(event.url));
		const pending = await invoke<{ url: string | null }>("plugin:push|pending");
		if (pending.url) onOpen(pending.url);
		return () => {
			void token.unregister();
			void opened.unregister();
		};
	}
	const listener = (event: MessageEvent) => {
		if (event.data?.type === "zaimu-push-open" && typeof event.data.url === "string")
			onOpen(event.data.url);
	};
	navigator.serviceWorker?.addEventListener("message", listener);
	return () => navigator.serviceWorker?.removeEventListener("message", listener);
}
