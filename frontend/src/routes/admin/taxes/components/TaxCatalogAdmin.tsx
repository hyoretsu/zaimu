import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import type { TaxDefinition } from "@zaimu/finance/yield-tax";
import { useState } from "react";
import { LuPencil, LuPlus, LuPower } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { fetchTaxCatalog } from "@/lib/tax-catalog";
import { showToast } from "@/stores";
import { TaxEditor } from "./TaxEditor";
export function TaxCatalogAdmin() {
	const catalog = useQuery({ queryFn: fetchTaxCatalog, queryKey: ["tax-definitions"] });
	const [editing, setEditing] = useState<TaxDefinition | null | undefined>();
	const [pending, setPending] = useState<string[]>([]);
	const client = useQueryClient();
	const toggle = useMutation({
		mutationFn: (tax: TaxDefinition) =>
			fetchWithAuth(`/admin/taxes/${tax.id}`, {
				body: JSON.stringify({ isActive: !tax.isActive }),
				method: "PATCH",
			}),
		onError: error => showToast(error.message, "negative"),
		onMutate: tax => setPending(current => [...current, tax.id]),
		onSettled: (_data, _error, tax) => setPending(current => current.filter(id => id !== tax.id)),
		onSuccess: () => {
			showToast("Disponibilidade atualizada.", "positive");
			void client.invalidateQueries({ queryKey: ["tax-definitions"] });
		},
	});
	return (
		<section className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-6">
			<h2 className="font-semibold text-lg">Impostos</h2>
			<ActionGroup>
				<Button onClick={() => setEditing(null)}>
					<LuPlus />
					Cadastrar imposto
				</Button>
			</ActionGroup>
			{catalog.isPending ? (
				<Skeleton className="h-32 w-full" />
			) : catalog.isError ? (
				<p role="alert">{catalog.error.message}</p>
			) : (
				catalog.data.map(tax => (
					<div
						className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"
						key={tax.id}
					>
						<div>
							<p className="font-medium">{tax.name}</p>
							<p className="text-muted-foreground text-sm">
								{tax.isActive ? "Disponível" : "Desativado"} - {tax.versions.at(-1)?.brackets.length} faixas
							</p>
						</div>
						<ActionGroup>
							<Button disabled={pending.includes(tax.id)} onClick={() => setEditing(tax)} variant="outline">
								<LuPencil />
								Editar
							</Button>
							<Button
								disabled={pending.includes(tax.id)}
								onClick={() => toggle.mutate(tax)}
								variant="outline"
							>
								<LuPower />
								{tax.isActive ? "Desativar" : "Ativar"}
							</Button>
						</ActionGroup>
					</div>
				))
			)}
			{editing !== undefined && <TaxEditor onClose={() => setEditing(undefined)} tax={editing} />}
		</section>
	);
}
