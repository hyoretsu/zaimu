import type { ReactNode } from "react";
export function GuideStep({
	number,
	title,
	children,
}: {
	number: number;
	title: string;
	children: ReactNode;
}) {
	return (
		<section aria-labelledby={`open-finance-step-${number}`} className="rounded-xl border bg-card p-5">
			<h2 className="mb-3 font-semibold" id={`open-finance-step-${number}`}>
				{number}. {title}
			</h2>
			<div className="space-y-4 text-sm">{children}</div>
		</section>
	);
}
