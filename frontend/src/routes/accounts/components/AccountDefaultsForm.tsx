import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DialogBody, DialogFooter } from "@/components/ui/Dialog";
import { type AccountDefaultsDraft, saveAccountDefaults } from "@/lib/account-defaults";
import type { FinancialAccount } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { useCacheIdentity } from "@/lib/query-cache";

export type { AccountDefaultsDraft } from "@/lib/account-defaults";

export function AccountDefaultsForm({
	accounts,
	initialDraft,
	onClose,
}: {
	accounts: FinancialAccount[];
	initialDraft?: AccountDefaultsDraft;
	onClose: () => void;
}) {
	const primary = accounts.find(account => account.isPrimary)?.id ?? "none";
	const statements = accounts.find(account => account.isDefaultForStatements)?.id ?? "none";
	const [primaryId, setPrimaryId] = useState(initialDraft?.primaryId ?? primary);
	const [statementId, setStatementId] = useState(initialDraft?.statementId ?? statements);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const save = () => {
		const draft = { primaryId, statementId };
		runBackgroundModalAction({
			cache: { client: queryClient, operations: ["account"] },
			close: onClose,
			conflictKey: "account-defaults",
			failureMessage: "Não foi possível atualizar as contas padrão.",
			loadingMessage: "Atualizando contas padrão...",
			recovery: { kind: "account-defaults", payload: draft },
			run: () => saveAccountDefaults(draft, dataService.accounts),
			successMessage: "Contas padrão atualizadas.",
		});
	};
	const options = (types: string[]) =>
		accounts
			.filter(account => !account.isHidden && types.includes(account.type))
			.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }));
	return (
		<form
			className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
			onSubmit={event => {
				event.preventDefault();
				save();
			}}
		>
			<DialogBody>
				<div className="grid gap-2">
					<CustomSelect
						label="Conta padrão"
						onValueChange={setPrimaryId}
						options={[
							{ label: "Sem conta padrão", special: true, value: "none" },
							...options(["CHECKING", "CASH"]),
						]}
						placeholder="Selecione a conta padrão"
						searchable
						sortOptions={false}
						value={primaryId}
					/>
					<p className="text-muted-foreground text-sm">
						Usada em novas despesas. A primeira conta corrente ou dinheiro cadastrada é escolhida
						automaticamente.
					</p>
				</div>
				<div className="grid gap-2">
					<CustomSelect
						label="Conta padrão para faturas"
						onValueChange={setStatementId}
						options={[
							{ label: "Usar conta padrão", special: true, value: "none" },
							...options(["CHECKING", "CASH", "SAVINGS", "INVESTMENT"]),
						]}
						placeholder="Selecione a conta pagadora"
						searchable
						sortOptions={false}
						value={statementId}
					/>
					<p className="text-muted-foreground text-sm">
						Usada nos pagamentos de faturas. A conta pagadora própria do cartão tem prioridade.
					</p>
				</div>
			</DialogBody>
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					Descartar
				</Button>
				<Button type="submit">Salvar</Button>
			</DialogFooter>
		</form>
	);
}
