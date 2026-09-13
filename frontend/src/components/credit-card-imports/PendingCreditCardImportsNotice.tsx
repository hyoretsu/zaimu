import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuFileClock } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { PendingCreditCardImportsDialog } from "./PendingCreditCardImportsDialog";

export function PendingCreditCardImportsNotice({ onReview }: { onReview: (importId: string) => void }) {
	const identity = useCacheIdentity();
	const [selectionOpen, setSelectionOpen] = useState(false);
	const imports = useQuery({
		enabled: identity?.startsWith("user:") ?? false,
		queryFn: dataService.creditCardImports.getPending,
		queryKey: queryKeys.creditCardImports.pending(identity!),
	});
	if (imports.isPending && identity?.startsWith("user:"))
		return <Skeleton className="h-[5.25rem] rounded-2xl" />;
	if (imports.isError && !imports.data)
		return (
			<section className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 p-4">
				<p className="text-sm">Não foi possível verificar faturas pendentes.</p>
				<Button className="cursor-pointer" onClick={() => imports.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</section>
		);
	if (!imports.data?.length) return null;
	const purchases = imports.data.reduce((total, item) => total + item.items.length, 0);
	return (
		<>
			<section className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
				<div className="flex items-center gap-3">
					<LuFileClock className="size-5 text-amber-700" />
					<div>
						<p className="font-medium text-sm">Faturas aguardando revisão</p>
						<p className="text-muted-foreground text-xs">
							{imports.data.length} {imports.data.length === 1 ? "fatura" : "faturas"} · {purchases}{" "}
							{purchases === 1 ? "compra" : "compras"}
						</p>
					</div>
				</div>
				<Button
					className="cursor-pointer"
					onClick={() => {
						if (imports.data.length === 1) {
							onReview(imports.data[0]!.id);
							return;
						}
						setSelectionOpen(true);
					}}
					variant="outline"
				>
					Revisar
				</Button>
			</section>
			{imports.data.length > 1 && (
				<PendingCreditCardImportsDialog
					imports={imports.data}
					onOpenChange={setSelectionOpen}
					onReview={onReview}
					open={selectionOpen}
				/>
			)}
		</>
	);
}
