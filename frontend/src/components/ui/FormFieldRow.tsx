import type { ReactNode } from "react";

export function FormFieldRow({ children }: { children: ReactNode }) {
	return (
		<div className="grid min-w-0 grid-cols-[repeat(auto-fit,minmax(min(100%,8.5rem),1fr))] items-start gap-x-4 gap-y-2 [&>*]:row-span-3 [&>*]:grid [&>*]:min-w-0 [&>*]:grid-rows-subgrid">
			{children}
		</div>
	);
}
