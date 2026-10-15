import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormField } from "@/components/ui/FormField";
import { Skeleton } from "@/components/ui/Skeleton";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
import { InstitutionCatalogRow } from "./InstitutionCatalogRow";
import { LegacyInstitutionRow } from "./LegacyInstitutionRow";
import type { AdminInstitution } from "./types";

export function InstitutionCatalog() {
	const userId = useAuthStore(state => state.user?.id);
	const [search, setSearch] = useState("");
	const [input, setInput] = useDebouncedInput(search, setSearch);
	const query = useQuery({
		queryFn: () => fetchWithAuth<AdminInstitution[]>("/financial-institutions/review/catalog"),
		queryKey: ["admin-institution-catalog", userId],
	});
	const institutions = query.data?.filter(
		item =>
			(item.status === "APPROVED" || item.status === "LEGACY_PRIVATE") &&
			item.name.toLocaleLowerCase().includes(search.trim().toLocaleLowerCase()),
	);
	return (
		<section className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-6">
			<div>
				<h2 className="font-semibold text-lg">Catálogo global</h2>
				<p className="text-muted-foreground text-sm">
					Instituições aprovadas disponíveis para todos. Publique cadastros antigos ou associe-os a uma
					instituição global, preservando o histórico das contas.
				</p>
			</div>
			<FormField
				id="institution-search"
				label="Buscar instituição"
				name="institution-search"
				onChange={event => setInput(event.currentTarget.value)}
				placeholder="Ex: Nubank"
				type="text"
				value={input}
			/>
			{query.isPending ? (
				<div className="space-y-3">
					{[0, 1, 2].map(id => (
						<Skeleton className="h-24 w-full rounded-xl" key={id} />
					))}
				</div>
			) : query.isError ? (
				<div className="space-y-3">
					<p role="alert">{query.error.message}</p>
					<ActionGroup>
						<Button onClick={() => void query.refetch()} variant="outline">
							Tentar novamente
						</Button>
					</ActionGroup>
				</div>
			) : institutions?.length ? (
				institutions.map(institution =>
					institution.status === "LEGACY_PRIVATE" ? (
						<LegacyInstitutionRow
							approvedInstitutions={(query.data ?? []).filter(item => item.status === "APPROVED")}
							institution={institution}
							key={institution.id}
						/>
					) : (
						<InstitutionCatalogRow institution={institution} key={institution.id} />
					),
				)
			) : (
				<p className="text-muted-foreground text-sm">
					{search ? "Nenhuma instituição encontrada." : "Nenhuma instituição cadastrada."}
				</p>
			)}
		</section>
	);
}
