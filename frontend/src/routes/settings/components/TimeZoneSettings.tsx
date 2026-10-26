import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import {
	readTimeZonePreference,
	saveTimeZonePreference,
	timeZonePreferenceKey,
} from "@/lib/time-zone-preference";
import { showToast } from "@/stores";

const timeZones = ["GMT", ...Intl.supportedValuesOf("timeZone")];

export function TimeZoneSettings() {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const queryKey = timeZonePreferenceKey(identity);
	const query = useQuery({ queryFn: readTimeZonePreference, queryKey });
	const save = useMutation({
		mutationFn: saveTimeZonePreference,
		onError: () => showToast("Não foi possível salvar fuso horário", "negative"),
		onSuccess: result => {
			client.setQueryData(queryKey, result);
			showToast("Fuso horário atualizado", "positive");
			if (identity) void invalidateCacheOperation(client, identity, "recurring");
		},
	});
	const zones = [
		...new Set([...timeZones, ...(query.data?.preferredTimeZone ? [query.data.preferredTimeZone] : [])]),
	];
	return (
		<section className="card space-y-3 p-4">
			{query.isPending ? (
				<Skeleton className="h-20 w-full" />
			) : (
				<CustomSelect
					disabled={save.isPending}
					error={query.isError ? "Não foi possível carregar fuso horário" : undefined}
					label="Fuso horário"
					onRetry={() => void query.refetch()}
					onValueChange={value => save.mutate(!value || value === "automatic" ? null : value)}
					options={[
						{
							label: `Automático (${query.data?.defaultTimeZone ?? "GMT"})`,
							special: true,
							value: "automatic",
						},
						...zones.map(value => ({ label: value, value })),
					]}
					placeholder="Ex: America/Recife"
					searchable
					value={query.data?.preferredTimeZone ?? "automatic"}
				/>
			)}
			<p className="text-muted-foreground text-sm">
				Define a virada do dia para recorrências e parcelas. Automático usa o primeiro fuso do país
				selecionado; sem país ou fuso reconhecido, usa GMT.
			</p>
		</section>
	);
}
