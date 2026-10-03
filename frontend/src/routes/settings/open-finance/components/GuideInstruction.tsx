import type { ReactNode } from "react";
import { LuZoomIn } from "react-icons/lu";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";

export function GuideInstruction({
	number,
	title,
	image,
	children,
}: {
	number: number;
	title: string;
	image?: string;
	children: ReactNode;
}) {
	return (
		<li className="min-w-0 space-y-3 rounded-xl border bg-background/50 p-4">
			<h3 className="flex items-start gap-2 font-semibold">
				<span className="flex size-6 shrink-0 items-center justify-center rounded-full bg-primary/10 text-primary text-xs">
					{number}
				</span>
				{title}
			</h3>
			<div className="space-y-2 text-muted-foreground">{children}</div>
			{image && (
				<Dialog>
					<DialogTrigger asChild>
						<button
							aria-label={`Ampliar foto: ${title}`}
							className="w-full cursor-pointer rounded-lg border bg-white p-2 text-left"
						>
							<img
								alt={title}
								className="h-48 w-full object-contain"
								height={192}
								loading="lazy"
								src={image}
							/>
							<span className="mt-2 flex items-center justify-center gap-2 text-primary text-xs">
								<LuZoomIn />
								Ampliar foto
							</span>
						</button>
					</DialogTrigger>
					<DialogContent className="flex flex-col overflow-hidden sm:max-w-3xl">
						<DialogHeader>
							<DialogTitle>{title}</DialogTitle>
							<DialogDescription>
								Foto do Dashboard Pluggy. Siga instrução no Zaimu e volte para continuar.
							</DialogDescription>
						</DialogHeader>
						<ScrollArea className="h-[65dvh] min-h-0">
							<div className="p-1">
								<img alt={title} className="w-full rounded-lg" src={image} />
							</div>
						</ScrollArea>
					</DialogContent>
				</Dialog>
			)}
		</li>
	);
}
