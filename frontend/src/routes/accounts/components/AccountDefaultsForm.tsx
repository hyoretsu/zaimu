import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DialogFooter } from "@/components/ui/Dialog";
import type { FinancialAccount } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";

export function AccountDefaultsForm({
	accounts,
	onClose,
}: {
	accounts: FinancialAccount[];
	onClose: () => void;
}) {
	const primary = accounts.find(account => account.isPrimary)?.id ?? "none";
	const statements = accounts.find(account => account.isDefaultForStatements)?.id ?? "none";
	const [primaryId, setPrimaryId] = useState(primary);
	const [statementId, setStatementId] = useState(statements);
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const save = useMutation({
		mutationFn: async () => {
			if (statementId !== statements) {
				if (statementId !== "none")
					await dataService.accounts.update(statementId, { isDefaultForStatements: true });
				else if (statements !== "none")
					await dataService.accounts.update(statements, { isDefaultForStatements: false });
			}
			if (primaryId !== primary)
				await dataService.accounts.setPrimary(primaryId === "none" ? null : primaryId);
		},
		onError: error => showToast(error.message, "negative"),
		onSettled: () => invalidateCacheOperation(queryClient, identity!, "account"),
		onSuccess: () => {
			showToast("Contas padrão atualizadas.", "positive");
			onClose();
		},
	});
	const options = (types: string[]) =>
		accounts
			.filter(account => !account.isHidden && types.includes(account.type))
			.map(account => ({ label: getFinancialAccountOptionLabel(account), value: account.id }));
	return (
		<form
			className="grid gap-5"
			onSubmit={event => {
				event.preventDefault();
				save.mutate();
			}}
		>
			<div className="grid gap-2">
				<CustomSelect
					disabled={save.isPending}
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
					disabled={save.isPending}
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
			<DialogFooter>
				<Button onClick={onClose} type="button" variant="outline">
					Descartar
				</Button>
				<Button disabled={save.isPending} type="submit">
					{save.isPending ? "Salvando..." : "Salvar"}
				</Button>
			</DialogFooter>
		</form>
	);
}
