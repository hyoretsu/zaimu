import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import { useCacheIdentity } from "@/lib/query-cache";
import {
	readTimeFormatPreference,
	saveTimeFormatPreference,
	type TimeFormat,
	timeFormatPreferenceKey,
} from "@/lib/time-format-preference";
import { showToast } from "@/stores";

const options: { label: string; value: TimeFormat }[] = [
	{ label: "12 horas (AM/PM)", value: "12h" },
	{ label: "24 horas", value: "24h" },
];

export function TimeFormatSettings() {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const queryKey = timeFormatPreferenceKey(identity);
	const query = useQuery({
		enabled: identity !== null,
		queryFn: readTimeFormatPreference,
		queryKey,
		staleTime: Number.POSITIVE_INFINITY,
	});
	const save = useMutation({
		mutationFn: saveTimeFormatPreference,
		onError: () => showToast("Não foi possível salvar o formato de horário", "negative"),
		onSuccess: (_, value) => {
			queryClient.setQueryData(queryKey, value);
			showToast("Formato de horário atualizado", "positive");
		},
	});
	return (
		<section className="card space-y-3 p-4">
			{query.isPending ? (
				<Skeleton className="h-11 w-full" />
			) : (
				<CustomSelect
					disabled={save.isPending}
					label="Formato de horário"
					onValueChange={value => save.mutate(value as TimeFormat)}
					options={options}
					placeholder="Ex: 12 horas (AM/PM)"
					value={query.data}
				/>
			)}
			<p className="text-muted-foreground text-sm">
				Define como os horários são digitados: 02:30 PM ou 14:30. Fica salvo na sua conta.
			</p>
		</section>
	);
}
