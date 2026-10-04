import { useState } from "react";
import { LuPause, LuPlay, LuSave, LuUnplug } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { type FinancialAccount, type OpenFinanceConnection, openFinanceApi } from "@/lib/api";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import { showToast } from "@/stores";
export function AccountBindingRow({
	account,
	connection,
	destinations,
	onSaved,
}: {
	account: OpenFinanceConnection["remoteAccounts"][number];
	connection: OpenFinanceConnection;
	destinations: FinancialAccount[];
	onSaved: () => Promise<void>;
}) {
	const binding = connection.bindings.find(b => b.remoteAccountId === account.id);
	const [destination, setDestination] = useState(
		binding?.creditCardId ?? binding?.financialAccountId ?? "none",
	);
	const [pending, setPending] = useState(false);
	const card = account.type === "CREDIT";
	const options = destinations
		.filter(a =>
			card ? a.type === "CREDIT_CARD" && a.creditCard : ["CHECKING", "SAVINGS", "CASH"].includes(a.type),
		)
		.map(a => ({ label: getFinancialAccountDisplayName(a), value: card ? a.creditCard!.id : a.id }));
	const save = async (target: string, paused = false) => {
		setPending(true);
		try {
			await openFinanceApi.saveBinding(connection.id, {
				creditCardId: card && target !== "none" ? target : null,
				financialAccountId: !card && target !== "none" ? target : null,
				paused,
				remoteAccountId: account.id,
			});
			setDestination(target);
			showToast(
				target === "none" ? "Vínculo removido" : paused ? "Vínculo pausado" : "Vínculo salvo",
				"positive",
			);
			await onSaved();
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Não foi possível salvar vínculo", "negative");
		} finally {
			setPending(false);
		}
	};
	return (
		<div className="space-y-3 rounded-lg border p-4">
			<div>
				<p className="font-medium">{account.name}</p>
				<p className="text-muted-foreground text-xs">
					{card ? "Cartão de crédito" : account.type === "BANK" ? "Conta bancária" : "Tipo indisponível"} -{" "}
					{binding?.paused ? "Pausado" : binding ? "Vinculado" : "Sem vínculo"}
				</p>
			</div>
			<CustomSelect
				disabled={pending || !["BANK", "CREDIT"].includes(account.type) || account.currencyCode !== "BRL"}
				label="Destino local"
				onValueChange={setDestination}
				options={[{ label: "Não importar esta conta", special: true, value: "none" }, ...options]}
				placeholder="Selecione conta ou cartão"
				searchable
				value={destination}
			/>
			<ActionGroup>
				<Button disabled={pending} onClick={() => void save(destination)} size="sm">
					<LuSave />
					Salvar vínculo
				</Button>
				{binding && (
					<>
						<Button
							disabled={pending}
							onClick={() => void save(binding.creditCardId ?? binding.financialAccountId!, !binding.paused)}
							size="sm"
							variant="outline"
						>
							{binding.paused ? <LuPlay /> : <LuPause />}
							{binding.paused ? "Retomar" : "Pausar"}
						</Button>
						<Button disabled={pending} onClick={() => void save("none")} size="sm" variant="outline">
							<LuUnplug />
							Desvincular
						</Button>
					</>
				)}
			</ActionGroup>
		</div>
	);
}
