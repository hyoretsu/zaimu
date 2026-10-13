import { useQuery } from "@tanstack/react-query";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { type AccountDefaultsDraft, AccountDefaultsForm } from "./AccountDefaultsForm";

export function AccountDefaultsDialog({
	initialDraft,
	onOpenChange,
}: {
	initialDraft?: AccountDefaultsDraft;
	onOpenChange: (open: boolean) => void;
}) {
	const identity = useCacheIdentity();
	const accounts = useQuery({
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	return (
		<Dialog onOpenChange={onOpenChange} open>
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>Contas padrão</DialogTitle>
					<DialogDescription>Escolha contas para novas despesas e pagamentos de faturas.</DialogDescription>
				</DialogHeader>
				{accounts.isPending ? (
					<DialogBody>
						<div className="grid gap-5">
							<Skeleton className="h-24" />
							<Skeleton className="h-24" />
							<Skeleton className="h-10" />
						</div>
					</DialogBody>
				) : accounts.isError ? (
					<DialogBody>
						<p className="text-destructive text-sm">Não foi possível carregar as contas.</p>
					</DialogBody>
				) : (
					<AccountDefaultsForm
						accounts={accounts.data}
						initialDraft={initialDraft}
						onClose={() => onOpenChange(false)}
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
