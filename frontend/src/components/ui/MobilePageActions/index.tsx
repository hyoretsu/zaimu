import { useState } from "react";
import { createPortal } from "react-dom";
import { LuMenu } from "react-icons/lu";
import { useMediaQuery } from "@/hooks/use-media-query";
import { Button } from "../Button";
import { Popover, PopoverContent, PopoverTrigger } from "../Popover";
import { ScrollArea } from "../ScrollArea";
import type { MobilePageAction } from "./types";

export type { MobilePageAction } from "./types";

export function MobilePageActions({ actions }: { actions: MobilePageAction[] }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	const [open, setOpen] = useState(false);
	if (!isMobile || !actions.length) return null;
	const action = actions[0];
	const multiple = actions.length > 1;
	const Icon = multiple ? LuMenu : action.icon;
	const trigger = (
		<Button
			aria-label={multiple ? "Ações da tela" : action.label}
			className="size-14 cursor-pointer rounded-full border-primary/30 shadow-xl disabled:cursor-not-allowed"
			disabled={!multiple && action.disabled}
			onClick={multiple ? undefined : action.onClick}
			size="icon"
			type="button"
		>
			<Icon aria-hidden="true" className="size-6" />
		</Button>
	);
	return createPortal(
		<div className="fixed right-[max(1rem,env(safe-area-inset-right))] bottom-[calc(var(--mobile-navigation-height)+1rem)] z-50">
			{multiple ? (
				<Popover onOpenChange={setOpen} open={open}>
					<PopoverTrigger asChild>{trigger}</PopoverTrigger>
					<PopoverContent align="end" aria-label="Ações da tela" className="p-0" side="top" sideOffset={12}>
						<ScrollArea
							className="min-h-0 overflow-hidden rounded-2xl"
							style={{
								height: `min(${actions.length * 52 + 16}px, var(--radix-popover-content-available-height))`,
							}}
						>
							<div className="grid gap-2 p-3">
								{actions.map(item => (
									<Button
										className="h-11 w-full cursor-pointer justify-start disabled:cursor-not-allowed"
										disabled={item.disabled}
										key={item.label}
										onClick={() => {
											setOpen(false);
											item.onClick();
										}}
										type="button"
										variant="outline"
									>
										<item.icon aria-hidden="true" /> {item.label}
									</Button>
								))}
							</div>
						</ScrollArea>
					</PopoverContent>
				</Popover>
			) : (
				trigger
			)}
		</div>,
		document.body,
	);
}
