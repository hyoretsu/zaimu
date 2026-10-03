import { isTauri } from "@tauri-apps/api/core";
import type { ReactNode } from "react";
import { LuExternalLink } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { showToast } from "@/stores";

export function PluggyLink({ href, children }: { href: string; children: ReactNode }) {
	return (
		<Button asChild variant="outline">
			<a
				className="max-w-full cursor-pointer"
				href={href}
				onClick={event => {
					if (!isTauri()) return;
					event.preventDefault();
					event.stopPropagation();
					void import("@tauri-apps/plugin-opener")
						.then(({ openUrl }) => openUrl(href))
						.catch(() => showToast("Não foi possível abrir navegador. Tente novamente.", "negative"));
				}}
				rel="noreferrer"
				target="_blank"
			>
				<LuExternalLink />
				{children}
			</a>
		</Button>
	);
}
