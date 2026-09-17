import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";
import { Badge } from "./Badge";

export function AppBadge({ className, ...props }: ComponentProps<typeof Badge>) {
	return <Badge className={cn("h-7 max-w-full gap-1.5 px-2.5 font-normal", className)} {...props} />;
}
