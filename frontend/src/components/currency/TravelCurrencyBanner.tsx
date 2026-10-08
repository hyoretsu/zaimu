import { useQuery, useQueryClient } from "@tanstack/react-query";
import { travelSuggestionKey } from "@zaimu/finance/currency-preference";
import { useState } from "react";
import { LuGlobe, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { localMeta } from "@/lib/localStorage";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
export function TravelCurrencyBanner() {
	const owner = useCacheIdentity();
	const { preferredCurrency, location, loading, setPreference } = useCurrencyStore();
	const queryClient = useQueryClient();
	const [open, setOpen] = useState(false);
	const [saving, setSaving] = useState(false);
	const key =
		owner && preferredCurrency && location ? travelSuggestionKey(owner, preferredCurrency, location) : null;
	const queryKey = ["identity", owner, "travel-currency-dismissal", key];
	const dismissal = useQuery({
		enabled: !!key && !!owner,
		queryFn: () => localMeta.get(`travel-dismissal:${key}`, owner!).then(value => value === true),
		queryKey,
	});
	if (
		loading ||
		dismissal.isPending ||
		dismissal.isError ||
		!owner ||
		!key ||
		!location ||
		!preferredCurrency ||
		preferredCurrency === location.currency ||
		dismissal.data
	)
		return null;
	const target = location.currency;
	const confirm = async () => {
		setSaving(true);
		try {
			await setPreference(target);
			setOpen(false);
			showToast(`Moeda padrão alterada para ${target}`, "positive");
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Não foi possível alterar a moeda", "negative");
		} finally {
			setSaving(false);
		}
	};
	return (
		<aside className="card space-y-3 border border-primary-500/30 p-4">
			<p className="flex items-center gap-2 font-semibold">
				<LuGlobe /> Moeda da sua localização: {target}
			</p>
			<p className="text-foreground-secondary text-sm">
				Sua preferência está em {preferredCurrency}. Deseja usar {target} durante a viagem?
			</p>
			<ActionGroup>
				<Button
					onClick={() => {
						void localMeta
							.set(`travel-dismissal:${key}`, true, owner)
							.then(() => {
								queryClient.setQueryData(queryKey, true);
								showToast("Sugestão dispensada para esta localização", "info");
							})
							.catch(error =>
								showToast(error instanceof Error ? error.message : "Não foi possível dispensar", "negative"),
							);
					}}
					variant="outline"
				>
					<LuX /> Dispensar
				</Button>
				<Button onClick={() => setOpen(true)}>
					<LuGlobe /> Trocar moeda
				</Button>
			</ActionGroup>
			<Dialog
				modal
				onOpenChange={value => {
					if (!saving) setOpen(value);
				}}
				open={open}
			>
				<DialogContent className="overflow-hidden" showCloseButton={!saving}>
					<DialogHeader>
						<DialogTitle>Usar {target} como moeda padrão?</DialogTitle>
					</DialogHeader>
					<ScrollArea className="max-h-48 min-h-0">
						<DialogDescription>
							Novos cadastros e totais usarão {target}. Compras, contas e cartões existentes mantêm seus
							valores e moedas.
						</DialogDescription>
					</ScrollArea>
					<DialogFooter>
						<Button disabled={saving} onClick={() => setOpen(false)} variant="outline">
							Cancelar
						</Button>
						<Button disabled={saving} onClick={() => void confirm()}>
							{saving ? "Salvando..." : "Confirmar troca"}
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</aside>
	);
}
