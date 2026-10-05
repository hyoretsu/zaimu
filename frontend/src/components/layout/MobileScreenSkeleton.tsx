import { Skeleton } from "@/components/ui/Skeleton";

export function MobileScreenSkeleton() {
	return (
		<div aria-busy="true" aria-label="Carregando tela" className="space-y-6 p-5" role="status">
			<Skeleton className="h-10 w-48" />
			<Skeleton className="h-5 w-64" />
			<div className="grid gap-4 sm:grid-cols-2">
				{[0, 1, 2, 3].map(index => (
					<Skeleton className="h-36 rounded-3xl" key={index} />
				))}
			</div>
			<Skeleton className="h-72 rounded-3xl" />
		</div>
	);
}
