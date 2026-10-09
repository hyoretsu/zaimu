import type { ComponentProps } from "react";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { cn } from "@/lib/utils";

export function DialogBody({ className, children, ...props }: ComponentProps<typeof ScrollArea>) {
	return (
		<ScrollArea
			className={cn(
				"-m-1 grid min-h-0 min-w-0 shrink grid-rows-[minmax(0,1fr)] [&>[data-slot=scroll-area-viewport]]:h-auto [&>[data-slot=scroll-area-viewport]]:min-h-0",
				className,
			)}
			data-slot="dialog-body"
			{...props}
		>
			<div className="grid min-w-0 gap-5 p-1">{children}</div>
		</ScrollArea>
	);
}
