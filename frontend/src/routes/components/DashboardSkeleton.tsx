import { PageContainer } from "@/components/ui/PageContainer";
import { Skeleton } from "@/components/ui/Skeleton";

export function DashboardSkeleton() {
	return (
		<PageContainer className="space-y-6">
			<Skeleton className="h-28 rounded-2xl" />
			<div className="grid gap-3 sm:gap-4 xl:grid-cols-[minmax(0,1fr)_minmax(0,2fr)] xl:grid-rows-[auto_auto]">
				<Skeleton className="h-40 rounded-2xl xl:row-span-2 xl:h-full" />
				<Skeleton className="h-32 rounded-2xl xl:h-24" />
				<Skeleton className="h-28 rounded-2xl xl:h-20" />
			</div>
			<Skeleton className="h-80 rounded-2xl" />
			<div className="grid gap-4 lg:grid-cols-2">
				{[1, 2, 3, 4].map(item => (
					<Skeleton className="h-52 rounded-2xl" key={item} />
				))}
			</div>
		</PageContainer>
	);
}
