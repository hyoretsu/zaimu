import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import { countryCodes, readCountryPreference, saveCountryPreference } from "@/lib/country-preference";
import { getCurrentCacheIdentity } from "@/lib/query-cache";
import { timeZonePreferenceKey } from "@/lib/time-zone-preference";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";
export function CountrySettings() {
	const client = useQueryClient();
	const userId = useAuthStore(state => state.user?.id ?? state.guestId);
	const query = useQuery({ queryFn: readCountryPreference, queryKey: ["country-preference", userId] });
	const [saving, setSaving] = useState(false);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "region" });
	return (
		<section className="card space-y-3 p-4">
			{query.isPending ? (
				<Skeleton className="h-11 w-full" />
			) : (
				<CustomSelect
					disabled={saving}
					label="País do Zaimu"
					onValueChange={value => {
						setSaving(true);
						void saveCountryPreference(value)
							.then(() => {
								void query.refetch();
								void client.invalidateQueries({
									queryKey: timeZonePreferenceKey(getCurrentCacheIdentity()),
								});
								showToast("País atualizado", "positive");
							})
							.catch(error => showToast(error.message, "negative"))
							.finally(() => setSaving(false));
					}}
					options={countryCodes.map(value => ({ label: names.of(value) ?? value, value }))}
					placeholder="Ex: Brasil"
					searchable
					value={query.data ?? undefined}
				/>
			)}
			<p className="text-muted-foreground text-sm">
				Sugere o país de novas contas. País e moeda de contas existentes permanecem independentes.
			</p>
		</section>
	);
}
