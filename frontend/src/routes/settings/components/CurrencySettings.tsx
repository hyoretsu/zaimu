import { useState } from "react";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { Skeleton } from "@/components/ui/Skeleton";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
export function CurrencySettings() {
	const { currencies, currency, loading, error, setPreference } = useCurrencyStore();
	const [saving, setSaving] = useState(false);
	const names = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "currency" });
	return (
		<section className="card space-y-3 p-4">
			{loading ? (
				<Skeleton className="h-11 w-full" />
			) : (
				<CustomSelect
					disabled={saving}
					label="Moeda padrão"
					onValueChange={value => {
						setSaving(true);
						void setPreference(value)
							.then(() => showToast("Moeda padrão atualizada", "positive"))
							.catch(error =>
								showToast(error instanceof Error ? error.message : "Não foi possível salvar", "negative"),
							)
							.finally(() => setSaving(false));
					}}
					options={currencies.map(value => ({ label: `${value} - ${names.of(value) ?? value}`, value }))}
					placeholder="Ex: BRL - Real brasileiro"
					searchable
					value={currency}
				/>
			)}
			<p className="text-foreground-secondary text-sm">
				Moeda usada em novos cadastros e totais: {currency}. Valores existentes mantêm sua moeda.
			</p>
			{error && <p className="text-danger text-sm">{error}</p>}
		</section>
	);
}
