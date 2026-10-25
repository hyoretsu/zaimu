import { useRef, useState } from "react";
import { LuMenu } from "react-icons/lu";
import { Button } from "./Button";
import { FloatingActionButton } from "./FloatingActionButton";
import { Popover, PopoverContent, PopoverTrigger } from "./Popover";
import type { PageAction } from "./page-action";
import { ScrollArea } from "./ScrollArea";

export function FloatingActionMenu({ actions }: { actions: PageAction[] }) {
	const [open, setOpen] = useState(false);
	const actionSelected = useRef(false);
	if (!actions.length) return null;
	const trigger = <FloatingActionButton icon={LuMenu} label="Ações da tela" />;
	return (
		<Popover
			onOpenChange={nextOpen => {
				if (nextOpen) actionSelected.current = false;
				setOpen(nextOpen);
			}}
			open={open}
		>
			<PopoverTrigger asChild>{trigger}</PopoverTrigger>
			<PopoverContent
				align="end"
				aria-label="Ações da tela"
				className="p-0"
				onCloseAutoFocus={event => {
					// An action may open a dialog. Keep its focus instead of returning to the menu trigger.
					if (actionSelected.current) event.preventDefault();
				}}
				side="top"
				sideOffset={12}
			>
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
									actionSelected.current = true;
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
	);
}
