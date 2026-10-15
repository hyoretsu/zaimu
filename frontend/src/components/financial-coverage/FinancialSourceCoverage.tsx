import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuCalendarPlus, LuCheck } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";

interface CoverageItem {
	id: string;
	kind: string;
	name: string;
	source: string;
	version: string | null;
	startDate: string | null;
	endDate: string | null;
	status: string;
	countryCode: string | null;
	affectedAccountIds: string[];
	gaps: { startDate: string; endDate: string }[];
}
interface CoverageReport {
	items: CoverageItem[];
	accounts: { id: string; name: string | null; currency: string; countryCode: string | null }[];
}
const kinds: Record<string, string> = {
	ACCOUNT_COUNTRY: "País da conta",
	ASSOCIATION: "Associação CLDR",
	CALENDAR: "Calendário",
	POLICY: "Política de perfil",
	PROFILE_HISTORY: "Histórico de perfil",
	TAX: "Imposto",
};
const states: Record<string, string> = {
	APPROVED: "Aprovado",
	COMPLETE: "Completo",
	GAP: "Lacuna",
	MANUAL_PENDING: "Aguardando confirmação",
	MISSING: "Ausente",
	PARTIAL: "Parcial",
	PENDING: "Pendente",
	PENDING_CONFIRMATION: "Aguardando confirmação",
	UNAVAILABLE: "Indisponível",
};
export function FinancialSourceCoverage({
	startDate,
	endDate,
	admin = true,
}: {
	startDate: string;
	endDate: string;
	admin?: boolean;
}) {
	const userId = useAuthStore(state => state.user?.id);
	const [pending, setPending] = useState<string[]>([]);
	const query = useQuery({
		queryFn: () =>
			fetchWithAuth<CoverageReport>(`/financial-history/coverage?startDate=${startDate}&endDate=${endDate}`),
		queryKey: ["financial-source-coverage", userId, startDate, endDate],
	});
	return (
		<section className="grid min-w-0 gap-4 rounded-2xl border bg-card p-4 sm:p-6">
			<h2 className="font-semibold text-lg">Fontes e vigências</h2>
			<p className="text-muted-foreground text-sm">
				Consulta somente leitura. Impostos, políticas e perfis representam vigências registradas. Calendários
				completos sem eventos continuam completos.
			</p>
			{query.isPending ? (
				<div className="space-y-3">
					<Skeleton className="h-24 w-full" />
					<Skeleton className="h-24 w-full" />
				</div>
			) : query.isError ? (
				<p role="alert">{query.error.message}</p>
			) : (
				<>
					{query.data?.items.map(item => (
						<article className="grid min-w-0 gap-2 rounded-xl border p-4" key={item.id}>
							<h3 className="font-semibold">
								{kinds[item.kind] ?? item.kind} - {item.name}
							</h3>
							<p className="break-words text-muted-foreground text-sm">
								{states[item.status] ?? item.status} - Fonte: {item.source} - Versão:{" "}
								{item.version ?? "Não registrada"} - {item.startDate ?? "Sem início"} a{" "}
								{item.endDate ?? "Sem término"}
							</p>
							{item.gaps.map(gap => (
								<p className="text-sm" key={`${gap.startDate}:${gap.endDate}`}>
									Lacuna: {gap.startDate} a {gap.endDate}
								</p>
							))}
							{admin && item.kind === "CALENDAR" && item.countryCode && item.startDate && (
								<ActionGroup>
									<Button
										disabled={pending.includes(item.id)}
										onClick={() => {
											setPending(ids => [...ids, item.id]);
											void fetchWithAuth(
												`/admin/yield-calendar/countries/${item.countryCode}/coverage/${item.startDate!.slice(0, 4)}`,
												{ method: "POST" },
											)
												.then(async () => {
													await query.refetch();
													showToast("Calendário processado", "positive");
												})
												.catch(error => showToast(error.message, "negative"))
												.finally(() => setPending(ids => ids.filter(id => id !== item.id)));
										}}
										variant="outline"
									>
										<LuCalendarPlus />
										Preencher calendário
									</Button>
									{item.status !== "COMPLETE" && (
										<Button
											disabled={pending.includes(item.id)}
											onClick={() => {
												setPending(ids => [...ids, item.id]);
												void fetchWithAuth(
													`/admin/yield-calendar/countries/${item.countryCode}/coverage/${item.startDate!.slice(0, 4)}/confirm`,
													{ method: "POST" },
												)
													.then(async () => {
														await query.refetch();
														showToast("Calendário administrativo confirmado", "positive");
													})
													.catch(error => showToast(error.message, "negative"))
													.finally(() => setPending(ids => ids.filter(id => id !== item.id)));
											}}
											variant="outline"
										>
											<LuCheck />
											Confirmar calendário revisado
										</Button>
									)}
								</ActionGroup>
							)}
						</article>
					))}
					{!query.data?.items.length && <p>Nenhuma fonte registrada no período.</p>}
				</>
			)}
		</section>
	);
}
