import type { ReactNode } from "react";
import { cn } from "@/lib/utils";

export function FormFieldRow({ children, className }: { children: ReactNode; className?: string }) {
	return (
		<div
			className={cn(
				"grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] items-start gap-x-4 gap-y-2 has-[[data-slot=money-field]]:grid-cols-[repeat(auto-fit,minmax(min(100%,9rem),1fr))] [&>*]:row-span-3 [&>*]:grid [&>*]:min-w-0 [&>*]:grid-rows-subgrid",
				className,
			)}
		>
			{children}
		</div>
	);
}
