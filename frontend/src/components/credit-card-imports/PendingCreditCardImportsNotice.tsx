import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuFileClock, LuFileSearch } from "react-icons/lu";
import { ActionNotice } from "@/components/ui/ActionNotice";
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
		return <Skeleton className="h-[5.625rem] rounded-2xl" />;
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
	const purchases = imports.data.reduce((total, item) => total + item.pendingItemCount, 0);
	return (
		<>
			<ActionNotice
				action={
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
						<LuFileSearch /> Revisar
					</Button>
				}
				description={
					<>
						{imports.data.length} {imports.data.length === 1 ? "fatura" : "faturas"} · {purchases}{" "}
						{purchases === 1 ? "compra" : "compras"}
					</>
				}
				icon={<LuFileClock aria-hidden="true" className="size-5 text-amber-700" />}
				title="Faturas aguardando revisão"
				tone="warning"
			/>
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
