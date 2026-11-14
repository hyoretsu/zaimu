import { Skeleton } from "@/components/ui/Skeleton";

export function PublicCapableRouteSkeleton() {
	return (
		<div
			aria-busy="true"
			aria-label="Carregando página"
			className="mx-auto min-h-dvh w-full max-w-6xl space-y-8 px-5 py-6 sm:px-8 sm:py-10"
			role="status"
		>
			<div className="flex items-center justify-between gap-4">
				<Skeleton className="h-11 w-40" />
				<Skeleton className="h-10 w-48" />
			</div>
			<div className="space-y-3">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-5 w-80 max-w-full" />
			</div>
			<div className="grid gap-4 sm:grid-cols-2">
				{[0, 1].map(index => (
					<Skeleton className="h-36 rounded-3xl" key={index} />
				))}
			</div>
			<Skeleton className="h-72 rounded-3xl" />
		</div>
	);
}
