import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuClock3, LuFileSearch } from "react-icons/lu";
import { ActionNotice } from "@/components/ui/ActionNotice";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores";
import { PendingTransactionImportsDialog } from "./PendingTransactionImportsDialog";

export function PendingTransactionImportsNotice({ onReview }: { onReview: (importId: string) => void }) {
	const isAuthenticated = useAuthStore(state => state.isAuthenticated);
	const identity = useCacheIdentity();
	const [selectionOpen, setSelectionOpen] = useState(false);
	const imports = useQuery({
		enabled: isAuthenticated && identity !== null,
		queryFn: dataService.transactionImports.getPending,
		queryKey: queryKeys.transactionImports.pending(identity!),
	});
	if (imports.isPending && isAuthenticated) return <Skeleton className="h-[5.625rem] rounded-2xl" />;
	if (imports.isError && !imports.data)
		return (
			<section className="flex items-center justify-between gap-3 rounded-2xl border border-destructive/30 p-4">
				<p className="text-sm">Não foi possível verificar extratos pendentes.</p>
				<Button className="cursor-pointer" onClick={() => imports.refetch()} variant="outline">
					Tentar novamente
				</Button>
			</section>
		);
	const pendingImports = imports.data;
	if (!pendingImports?.length) return null;
	const itemCount = pendingImports.reduce(
		(sum, transactionImport) => sum + transactionImport.items.length,
		0,
	);
	return (
		<>
			<ActionNotice
				action={
					<Button
						className="cursor-pointer"
						onClick={() => {
							if (pendingImports.length === 1) {
								onReview(pendingImports[0].id);
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
						{pendingImports.length} {pendingImports.length === 1 ? "extrato" : "extratos"} · {itemCount}{" "}
						transações ainda não afetam seus saldos.
					</>
				}
				icon={<LuClock3 aria-hidden="true" className="size-5 text-amber-700" />}
				title="Extratos aguardando revisão"
				tone="warning"
			/>
			{pendingImports.length > 1 && (
				<PendingTransactionImportsDialog
					imports={pendingImports}
					onOpenChange={setSelectionOpen}
					onReview={onReview}
					open={selectionOpen}
				/>
			)}
		</>
	);
}
