import type { ComponentProps } from "react";
import { inputControlClassName } from "@/components/ui/input-styles";
import { cn } from "@/lib/utils";

function Input({ className, type, ...props }: ComponentProps<"input">) {
	return (
		<input
			className={cn(
				inputControlClassName,
				"file:text-foreground placeholder:text-muted-foreground focus-visible:border-ring aria-invalid:border-destructive dark:aria-invalid:border-destructive/50 transition-colors outline-none file:inline-flex file:h-7 file:border-0 file:bg-transparent file:text-sm file:font-medium disabled:pointer-events-none disabled:cursor-not-allowed disabled:opacity-50",
				className,
			)}
			data-slot="input"
			type={type}
			{...props}
		/>
	);
}

export { Input };
