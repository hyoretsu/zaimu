import { useLayoutEffect, useState } from "react";
import { createPortal } from "react-dom";
import { FloatingActionMenu } from "../FloatingActionMenu";
import type { PageAction } from "./types";

export type { PageAction } from "./types";

export function PageActions({ actions }: { actions: PageAction[] }) {
	const [portalContainer] = useState(() => document.createElement("div"));
	useLayoutEffect(() => {
		if (!actions.length) return;
		// Activity suspends layout effects for hidden tabs. Detach the entire portal
		// so its fixed wrapper cannot intercept clicks over the active tab's actions.
		document.body.appendChild(portalContainer);
		return () => {
			portalContainer.remove();
		};
	}, [actions.length, portalContainer]);
	if (!actions.length) return null;

	return createPortal(
		<div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--mobile-navigation-height)+1rem)] z-50 lg:bottom-[max(1rem,env(safe-area-inset-bottom))]">
			<FloatingActionMenu actions={actions} />
		</div>,
		portalContainer,
	);
}
