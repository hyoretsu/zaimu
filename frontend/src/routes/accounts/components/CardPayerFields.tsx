import { useQuery } from "@tanstack/react-query";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function CardPayerFields({
	enabled,
	onEnabledChange,
	onPayerChange,
	payer,
}: {
	enabled: boolean;
	onEnabledChange: (value: boolean) => void;
	onPayerChange: (value: string | null) => void;
	payer: string | null;
}) {
	const identity = useCacheIdentity();
	const accounts = useQuery({
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	if (accounts.isPending) return <Skeleton className="h-28" />;
	if (accounts.isError)
		return <p className="text-destructive text-sm">Não foi possível carregar contas pagadoras.</p>;
	return (
		<section className="grid gap-3 rounded-xl border p-3">
			<CustomSelect
				label="Conta pagadora"
				onValueChange={value => onPayerChange(value === "primary" ? null : value)}
				options={[
					{ label: "Usar conta primária", special: true, value: "primary" },
					...(accounts.data ?? [])
						.filter(account => !["CREDIT_CARD", "REWARDS"].includes(account.type))
						.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id })),
				]}
				placeholder="Selecione a conta pagadora"
				searchable
				sortOptions={false}
				value={payer ?? "primary"}
			/>
			<CheckboxField
				checkboxProps={{
					checked: enabled,
					id: "payment-suggestions",
					onCheckedChange: value => onEnabledChange(value === true),
				}}
			>
				Sugerir pagamento de faturas fechadas
			</CheckboxField>
			<p className="text-muted-foreground text-xs">Sugestões exigem revisão. Nenhum pagamento automático.</p>
		</section>
	);
}
