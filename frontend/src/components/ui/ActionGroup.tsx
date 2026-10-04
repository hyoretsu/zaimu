import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function ActionGroup({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn("flex min-w-0 flex-wrap items-center justify-end gap-2", className)}
			data-slot="action-group"
			{...props}
		/>
	);
}
