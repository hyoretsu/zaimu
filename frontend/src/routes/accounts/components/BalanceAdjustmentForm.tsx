import { useQuery, useQueryClient } from "@tanstack/react-query";
import { toMinorUnits } from "@zaimu/finance/money";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import type { BalanceAdjustment } from "@/lib/balance-adjustment";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey, parseLocalDate } from "@/lib/date";
import {
	compareFinancialAccountsByOptionLabel,
	getFinancialAccountOptionLabel,
} from "@/lib/financial-account";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";

export interface BalanceAdjustmentDraft {
	adjustment: BalanceAdjustment | null;
	balance: string;
	date: string;
	financialAccountId: string;
}

export function BalanceAdjustmentForm({
	adjustment,
	existingAdjustments,
	initialDraft,
	onClose,
}: {
	adjustment: BalanceAdjustment | null;
	existingAdjustments: BalanceAdjustment[];
	initialDraft?: BalanceAdjustmentDraft;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const [balance, setBalance] = useState(
		initialDraft?.balance ?? (adjustment ? String(adjustment.balance) : ""),
	);
	const [date, setDate] = useState(initialDraft?.date ?? adjustment?.date.slice(0, 10) ?? getLocalDateKey());
	const [financialAccountId, setFinancialAccountId] = useState(
		initialDraft?.financialAccountId ?? adjustment?.financialAccountId ?? "",
	);
	const accountsQuery = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.accounts.getAll(),
		queryKey: queryKeys.accounts.list(identity!),
	});
	const accounts = (accountsQuery.data ?? [])
		.filter(account => account.type !== "CREDIT_CARD" && account.type !== "REWARDS")
		.toSorted(compareFinancialAccountsByOptionLabel);
	const [error, setError] = useState<string | null>(null);
	const save = (form: HTMLFormElement) => {
		const values = new FormData(form);
		const submittedBalance = String(values.get("balance") ?? "").trim();
		const selectedAccount = accounts.find(account => account.id === financialAccountId);
		if (
			!financialAccountId ||
			!selectedAccount ||
			!/^\d{4}-\d{2}-\d{2}$/.test(date) ||
			getLocalDateKey(parseLocalDate(date)) !== date ||
			!submittedBalance ||
			!Number.isFinite(Number(submittedBalance)) ||
			Math.abs(Number(submittedBalance)) > 9999999999.99
		) {
			setError("Preencha conta, data e saldo válido antes de salvar.");
			return;
		}
		try {
			toMinorUnits(Math.abs(Number(submittedBalance)), selectedAccount.currency);
		} catch {
			setError("Informe um saldo válido para a moeda da conta.");
			return;
		}
		if (
			existingAdjustments.some(
				existing =>
					existing.id !== adjustment?.id &&
					existing.financialAccountId === financialAccountId &&
					existing.date.slice(0, 10) === date,
			)
		) {
			setError("Já existe um ajuste para esta conta nesta data. Edite o ajuste existente.");
			return;
		}
		const draft = { adjustment, balance: submittedBalance, date, financialAccountId };
		const data = {
			balance: Number(draft.balance),
			date: draft.date,
			financialAccountId: draft.financialAccountId,
		};
		runBackgroundModalAction({
			close: onClose,
			conflictKey: `balance-adjustment:${adjustment?.id ?? financialAccountId}`,
			failureMessage: "Não foi possível salvar o ajuste de saldo.",
			loadingMessage: "Salvando ajuste de saldo...",
			onSuccess: async () => {
				await Promise.all([
					invalidateCacheOperation(queryClient, identity!, "transaction"),
					queryClient.invalidateQueries({ queryKey: ["identity", identity, "balance-adjustments"] }),
				]);
			},
			recovery: { entityId: adjustment?.id, kind: "balance-adjustment", payload: draft },
			run: () =>
				adjustment
					? dataService.balanceAdjustments.update(adjustment.id, data)
					: dataService.balanceAdjustments.create(data),
			successMessage: "Ajuste de saldo salvo.",
		});
	};
	return (
		<Dialog onOpenChange={open => !open && onClose()} open>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>{adjustment ? "Editar ajuste de saldo" : "Novo ajuste de saldo"}</DialogTitle>
					<DialogDescription>
						Informe o saldo real da conta ao fim deste dia. Movimentações anteriores recalculam a diferença
						automaticamente.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-col gap-6 overflow-hidden"
					noValidate
					onSubmit={event => {
						event.preventDefault();
						save(event.currentTarget);
					}}
				>
					<DialogBody>
						<div className="grid gap-4">
							{error ? (
								<p className="text-destructive text-sm" role="alert">
									{error}
								</p>
							) : null}
							<CustomSelect
								label="Conta"
								onValueChange={setFinancialAccountId}
								options={accounts.map(account => ({
									label: getFinancialAccountOptionLabel(account),
									value: account.id,
								}))}
								placeholder="Selecione a conta"
								required
								searchable
								value={financialAccountId}
							/>
							<DateField
								id="balance-adjustment-date"
								label="Data"
								name="date"
								onValueChange={setDate}
								required
								value={date}
							/>
							<MoneyField
								currencyCode={
									accounts.find(account => account.id === financialAccountId)?.currency ??
									adjustment?.currency ??
									"BRL"
								}
								id="balance-adjustment-balance"
								label="Saldo real"
								onValueChange={setBalance}
								rawValueName="balance"
								required
								value={balance}
							/>
						</div>
					</DialogBody>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button className="cursor-pointer disabled:cursor-not-allowed" type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
