import { type ReactNode, useState } from "react";
import { Button } from "@/components/ui/Button";
export function LoanSection({
	title,
	summary,
	children,
	initiallyOpen = false,
}: {
	title: string;
	summary: string;
	children: ReactNode;
	initiallyOpen?: boolean;
}) {
	const [open, setOpen] = useState(initiallyOpen);
	return (
		<section className="rounded-xl border">
			<Button
				aria-expanded={open}
				className="h-auto w-full justify-between p-3 text-left whitespace-normal"
				onClick={() => setOpen(value => !value)}
				type="button"
				variant="outline"
			>
				<span>
					<strong className="block">{title}</strong>
					<span className="text-muted-foreground text-xs">{summary}</span>
				</span>
				<span>{open ? "Minimizar" : "Expandir"}</span>
			</Button>
			{open && <div className="space-y-4 p-3">{children}</div>}
		</section>
	);
}
