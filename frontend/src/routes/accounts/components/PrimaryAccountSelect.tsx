import { useMutation, useQueryClient } from "@tanstack/react-query";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import type { FinancialAccount } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function PrimaryAccountSelect({
	accounts,
	pending,
}: {
	accounts: FinancialAccount[];
	pending: boolean;
}) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const mutation = useMutation({
		mutationFn: dataService.accounts.setPrimary,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(queryClient, identity!, "account");
			showToast("Conta primária atualizada.", "positive");
		},
	});
	if (pending) return <Skeleton className="h-24" />;
	const available = accounts.filter(
		account => !account.isHidden && ["CHECKING", "CASH"].includes(account.type),
	);
	return (
		<section className="grid gap-2 rounded-2xl border bg-card p-5">
			<CustomSelect
				disabled={mutation.isPending}
				label="Conta primária"
				onValueChange={value => mutation.mutate(value === "none" ? null : value)}
				options={[
					{ label: "Sem conta primária", special: true, value: "none" },
					...available.map(account => ({
						label: getFinancialAccountOptionLabel(account),
						value: account.id,
					})),
				]}
				placeholder="Selecione a conta padrão para despesas"
				searchable
				sortOptions={false}
				value={available.find(account => account.isPrimary)?.id ?? "none"}
			/>
			<p className="text-muted-foreground text-sm">
				Padrão para novas despesas e sugestões de pagamento de faturas. Cada cartão pode escolher outra conta.
			</p>
		</section>
	);
}
