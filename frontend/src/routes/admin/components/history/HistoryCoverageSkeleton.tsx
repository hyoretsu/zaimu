import { Skeleton } from "@/components/ui/Skeleton";
export function HistoryCoverageSkeleton() {
	return (
		<div aria-busy="true" aria-label="Carregando cobertura histórica" className="grid gap-4" role="status">
			<div className="grid gap-3 sm:grid-cols-3">
				{[0, 1, 2].map(card => (
					<div className="grid gap-2 rounded-xl border p-3" key={card}>
						<Skeleton className="h-4 w-40 max-w-full" />
						<Skeleton className="h-7 w-20" />
					</div>
				))}
			</div>
			{[0, 1].map(series => (
				<div className="grid gap-3 rounded-xl border p-4" key={series}>
					<Skeleton className="h-6 w-40" />
					<Skeleton className="h-4 w-72 max-w-full" />
					<Skeleton className="h-4 w-64 max-w-full" />
					<div className="grid gap-2">
						{Array.from({ length: 12 }, (_, month) => (
							<div className="flex gap-3" key={month}>
								<Skeleton className="h-5 w-16 shrink-0" />
								<Skeleton className="h-5 flex-1" />
							</div>
						))}
					</div>
					<Skeleton className="h-12 w-full" />
				</div>
			))}
		</div>
	);
}
