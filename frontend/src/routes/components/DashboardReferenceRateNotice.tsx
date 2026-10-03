export function DashboardReferenceRateNotice({ available }: { available: boolean }) {
	if (available) return null;
	return (
		<p className="rounded-xl border border-amber-500/30 bg-amber-500/5 p-3 text-sm" role="status">
			Parcela pós-fixada da previsão indisponível até concluir histórico de dez anos de CDI/Selic. Saldos
			registrados e parcela prefixada continuam disponíveis.
		</p>
	);
}
