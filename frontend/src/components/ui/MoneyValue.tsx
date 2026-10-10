import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

export function MoneyValue({ className, ...props }: ComponentProps<"p">) {
	return (
		<p className={cn("font-bold text-xl tabular-nums tracking-tight sm:text-2xl", className)} {...props} />
	);
}
