import { Skeleton } from "@/components/ui/Skeleton";

export function AppLoadingState() {
	return (
		<div className="grid min-h-dvh grid-cols-1 gap-6 p-5 lg:grid-cols-[240px_1fr] lg:p-8">
			<Skeleton className="hidden h-full lg:block" />
			<div className="grid content-start gap-5">
				<Skeleton className="h-12 w-56" />
				<div className="grid gap-4 md:grid-cols-3">
					<Skeleton className="h-36" />
					<Skeleton className="h-36" />
					<Skeleton className="h-36" />
				</div>
				<Skeleton className="h-80" />
			</div>
		</div>
	);
}
