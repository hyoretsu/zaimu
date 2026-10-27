import { useQuery } from "@tanstack/react-query";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { dataService } from "@/lib/dataService";
import { useCacheIdentity } from "@/lib/query-cache";

export function ImportedTaxPurchaseSelect({
	currencyCode,
	importId,
	itemId,
	value,
	onChange,
}: {
	currencyCode: string;
	importId: string;
	itemId: string;
	value: string;
	onChange: (value: string) => void;
}) {
	const identity = useCacheIdentity();
	const purchases = useQuery({
		queryFn: async () => {
			const items = [];
			let cursor: string | undefined;
			do {
				const page = await dataService.creditCardImports.get(importId, cursor);
				items.push(...page.items);
				cursor = page.hasMore ? (page.nextCursor ?? undefined) : undefined;
			} while (cursor);
			return items.filter(
				item =>
					item.id !== itemId &&
					!item.isStatementCharge &&
					item.installmentAmount > 0 &&
					!item.metadataMissing?.length,
			);
		},
		queryKey: [identity, "import-tax-purchases", importId, itemId],
		staleTime: 0,
	});
	return (
		<div className="grid gap-2">
			<CustomSelect
				error={purchases.isError ? "Não foi possível carregar compras." : undefined}
				isLoading={purchases.isPending}
				label="Associar imposto a uma compra"
				onRetry={() => {
					void purchases.refetch();
				}}
				onValueChange={onChange}
				options={[
					{ label: "Não associar", special: true, value: "" },
					...(purchases.data ?? []).map(item => ({
						label: `${item.description} - ${new Intl.NumberFormat("pt-BR", { currency: currencyCode, style: "currency" }).format(item.installmentAmount)}`,
						value: item.id,
					})),
				]}
				placeholder="Selecione a compra da fatura"
				searchable
				value={value}
			/>
			<p className="text-muted-foreground text-xs">
				O valor deste item será incorporado à compra selecionada como imposto, sem encargo separado na
				fatura. Compras em BRL também aceitam IOF.
			</p>
		</div>
	);
}
