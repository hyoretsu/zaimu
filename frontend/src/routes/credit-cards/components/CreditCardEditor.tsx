import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { dataService, type FinancialAccountUpdateDraft } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CreateFinancialAccountDialog } from "../../accounts/components";

export function CreditCardEditor({
	accountId,
	name,
	onUpdate,
}: {
	accountId: string;
	name: string;
	onUpdate: (id: string, data: FinancialAccountUpdateDraft) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	const identity = useCacheIdentity();
	const account = useQuery({
		enabled: open && !!identity,
		queryFn: () => dataService.accounts.getById(accountId),
		queryKey: [...queryKeys.accounts.all(identity!), "detail", accountId],
	});
	return (
		<>
			<Button
				aria-busy={open && account.isPending}
				aria-label={`Editar ${name}`}
				disabled={open && account.isFetching}
				onClick={() => {
					setOpen(true);
					if (account.isError) void account.refetch();
				}}
				size="icon-sm"
				variant="outline"
			>
				<LuPencil />
			</Button>
			{open && (account.isError || account.data === null) && (
				<span className="order-last basis-full text-sm" role="alert">
					Não foi possível carregar o cartão. Tente editar novamente.
				</span>
			)}
			{open && account.data && (
				<CreateFinancialAccountDialog
					account={account.data}
					cardOnly
					contextual
					onCreate={async () => undefined}
					onOpenChange={setOpen}
					onUpdate={onUpdate}
					open={open}
					pending={false}
					showTrigger={false}
				/>
			)}
		</>
	);
}
