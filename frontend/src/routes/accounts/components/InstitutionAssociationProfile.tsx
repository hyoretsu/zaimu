import { useQuery } from "@tanstack/react-query";
import { fetchWithAuth } from "@/lib/dataService";
import { useAuthStore } from "@/stores/auth";
export function InstitutionAssociationProfile({ institutionId }: { institutionId: string }) {
	const userId = useAuthStore(state => state.user?.id);
	const guest = useAuthStore(state => state.isGuestMode);
	const query = useQuery({
		enabled: !guest && navigator.onLine,
		queryFn: async () => {
			const [profiles, history] = await Promise.all([
				fetchWithAuth<{ id: string; name: string; isDefault: boolean }[]>(
					`/financial-institutions/${institutionId}/profiles`,
				),
				fetchWithAuth<{ profileId: string; effectiveDate: string }[]>(
					`/financial-institutions/${institutionId}/profile-history`,
				),
			]);
			if (profiles.length <= 1) return null;
			const day = new Date().toLocaleDateString("sv-SE");
			const latest = history
				.filter(change => change.effectiveDate.slice(0, 10) <= day)
				.sort((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
				.at(-1);
			return (
				profiles.find(profile => profile.id === latest?.profileId)?.name ??
				profiles.find(profile => profile.isDefault)?.name ??
				"Padrão"
			);
		},
		queryKey: ["association-profile", userId, institutionId],
	});
	if (guest || !query.isSuccess || !query.data) return null;
	return (
		<div className="rounded-xl border p-3 text-sm">
			<p>Perfil do vínculo: {query.data}</p>
			<p className="text-muted-foreground">
				Perfil e mudanças agendadas valem para todas as contas desta instituição. Consulte e altere histórico
				no grupo após salvar.
			</p>
		</div>
	);
}
