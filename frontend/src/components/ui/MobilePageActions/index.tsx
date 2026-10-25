import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { useMediaQuery } from "@/hooks/use-media-query";
import { FloatingActionMenu } from "../FloatingActionMenu";
import type { MobilePageAction } from "./types";

export type { MobilePageAction } from "./types";

export function MobilePageActions({ actions }: { actions: MobilePageAction[] }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	const [portalContainer] = useState(() => document.createElement("div"));
	useLayoutEffect(() => {
		if (!isMobile || !actions.length) return;
		// Activity suspends layout effects for hidden tabs. Detach the entire portal
		// so its fixed wrapper cannot intercept clicks over the active tab's actions.
		document.body.appendChild(portalContainer);
		return () => {
			portalContainer.remove();
		};
	}, [isMobile, actions.length, portalContainer]);
	if (!isMobile || !actions.length) return null;

	return createPortal(
		<div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--mobile-navigation-height)+1rem)] z-50">
			<FloatingActionMenu actions={actions} />
		</div>,
		portalContainer,
	);
}
