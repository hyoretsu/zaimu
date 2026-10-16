import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { InvoicePaymentTiming } from "@zaimu/finance/payment-suggestions";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import {
	invoicePaymentPreferenceKey,
	readInvoicePaymentPreference,
	saveInvoicePaymentPreference,
} from "@/lib/invoice-payment-preference";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function InvoicePaymentSettings() {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const queryKey = invoicePaymentPreferenceKey(identity);
	const query = useQuery({ queryFn: readInvoicePaymentPreference, queryKey });
	const save = useMutation({
		mutationFn: saveInvoicePaymentPreference,
		onError: () => showToast("Não foi possível salvar preferência de pagamento", "negative"),
		onSuccess: (_, value) => {
			queryClient.setQueryData(queryKey, value);
			showToast("Preferência de pagamento atualizada", "positive");
		},
	});
	return (
		<section className="card space-y-3 p-4">
			{query.isPending ? (
				<Skeleton className="h-20 w-full" />
			) : query.isError ? (
				<p className="text-danger text-sm" role="alert">
					Não foi possível carregar preferência de pagamento.
				</p>
			) : (
				<CustomSelect
					disabled={save.isPending}
					label="Pagamento de faturas"
					onValueChange={value => save.mutate(value as InvoicePaymentTiming)}
					options={[
						{ label: "No fechamento", value: "CLOSING_DATE" },
						{ label: "No vencimento", value: "DUE_DATE" },
					]}
					placeholder="Ex: No vencimento"
					value={query.data}
				/>
			)}
			<p className="text-foreground-secondary text-sm">
				Define a data inicial das sugestões de agendamento. Datas passadas usam hoje. Você pode ajustar a data
				antes de salvar.
			</p>
		</section>
	);
}
