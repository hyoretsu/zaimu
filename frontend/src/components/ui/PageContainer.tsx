import type { ComponentProps } from "react";

import { cn } from "@/lib/utils";

export function PageContainer({ className, ...props }: ComponentProps<"div">) {
	return (
		<div
			className={cn(
				"mx-auto w-full max-w-7xl overflow-x-clip px-4 py-6 sm:px-6 lg:px-8 lg:py-10 [&>*]:min-w-0 [&>*]:max-w-full",
				className,
			)}
			{...props}
		/>
	);
}
