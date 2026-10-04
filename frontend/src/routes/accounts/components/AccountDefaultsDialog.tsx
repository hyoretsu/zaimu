import { useQuery } from "@tanstack/react-query";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { AccountDefaultsForm } from "./AccountDefaultsForm";

export function AccountDefaultsDialog({ onOpenChange }: { onOpenChange: (open: boolean) => void }) {
	const identity = useCacheIdentity();
	const accounts = useQuery({
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent className="max-h-[90dvh] overflow-hidden sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Contas padrão</DialogTitle>
					<DialogDescription>Escolha contas para novas despesas e pagamentos de faturas.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="max-h-[65dvh] min-h-0">
					<div className="p-1">
						{accounts.isPending ? (
							<div className="grid gap-5">
								<Skeleton className="h-24" />
								<Skeleton className="h-24" />
								<Skeleton className="h-10" />
							</div>
						) : accounts.isError ? (
							<p className="text-destructive text-sm">Não foi possível carregar as contas.</p>
						) : (
							<AccountDefaultsForm accounts={accounts.data} onClose={() => onOpenChange(false)} />
						)}
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
