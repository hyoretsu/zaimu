import { useState } from "react";
import { LuBell, LuBellOff } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { disablePushNotifications, enablePushNotifications } from "@/lib/push-notifications";
import { toast } from "@/lib/toast";

export function PushNotificationControl() {
	const [pending, setPending] = useState(false);
	const update = async (enabled: boolean) => {
		setPending(true);
		try {
			await (enabled ? enablePushNotifications() : disablePushNotifications());
			toast.success(
				enabled
					? "Notificações ativadas neste dispositivo."
					: "Notificações desativadas neste dispositivo.",
			);
		} catch (error) {
			toast.error(error instanceof Error ? error.message : "Não foi possível alterar notificações.");
		} finally {
			setPending(false);
		}
	};
	return (
		<ActionGroup>
			<Button disabled={pending} onClick={() => void update(true)} variant="outline">
				<LuBell />
				Ativar push
			</Button>
			<Button disabled={pending} onClick={() => void update(false)} variant="outline">
				<LuBellOff />
				Desativar push
			</Button>
		</ActionGroup>
	);
}
