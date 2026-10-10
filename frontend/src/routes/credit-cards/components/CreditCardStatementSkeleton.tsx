import { Skeleton } from "@/components/ui/Skeleton";

export function CreditCardStatementSkeleton() {
	return (
		<div className="grid gap-3 pr-3 pb-24">
			<div className="grid gap-3 rounded-xl border bg-muted/30 p-4">
				<div className="flex items-center justify-between gap-2">
					<Skeleton className="h-7 w-40" />
					<Skeleton className="h-7 w-28 rounded-full" />
				</div>
				<div className="grid gap-2">
					<Skeleton className="h-4 w-24" />
					<Skeleton className="h-8 w-44" />
				</div>
				<div className="grid grid-cols-2 gap-4 border-t pt-3">
					{[1, 2].map(item => (
						<div className="grid gap-1" key={item}>
							<Skeleton className="h-4 w-24" />
							<Skeleton className="h-5 w-24" />
						</div>
					))}
				</div>
			</div>
			<div className="flex justify-between gap-2">
				<Skeleton className="h-5 w-24" />
				<Skeleton className="h-4 w-20" />
			</div>
			{[1, 2, 3].map(item => (
				<div className="grid gap-2 rounded-xl border p-3" key={item}>
					<div className="flex justify-between gap-2">
						<Skeleton className="h-5 w-48 max-w-[60%]" />
						<Skeleton className="h-5 w-20" />
					</div>
					<Skeleton className="h-4 w-32" />
					<Skeleton className="h-7 w-28 rounded-full" />
				</div>
			))}
		</div>
	);
}
