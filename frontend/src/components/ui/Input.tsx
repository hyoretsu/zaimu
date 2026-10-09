import type { ComponentProps } from "react";
import { inputControlClassName } from "@/components/ui/input-styles";

import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
	return (
		<input
			className={cn(
				inputControlClassName,
				"outline-none transition-colors file:inline-flex file:h-7 file:border-0 file:bg-transparent file:font-medium file:text-foreground file:text-sm placeholder:text-muted-foreground focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40",
				className,
			)}
			data-slot="input"
			type={type}
			{...props}
		/>
	);
}

export { Input };
