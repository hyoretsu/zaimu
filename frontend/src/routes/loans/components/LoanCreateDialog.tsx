import { useQuery, useQueryClient } from "@tanstack/react-query";
import { useRef, useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { Loan } from "@/lib/api";
import { runBackgroundModalAction } from "@/lib/background-modal-actions";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { useCacheIdentity } from "@/lib/query-cache";
import { useCurrencyStore } from "@/stores/currency";
import { LoanNumericField } from "./LoanNumericField";

type LoanCreateInput = Parameters<typeof dataService.loans.create>[0];

export function LoanCreateDialog({
	initialDraft,
	onClose,
}: {
	initialDraft?: LoanCreateInput;
	onClose: () => void;
}) {
	const identity = useCacheIdentity();
	const [institutionId, setInstitutionId] = useState(initialDraft?.institutionId ?? "");
	const institutions = useQuery({
		enabled: !!identity,
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["identity", identity, "loan-institutions"],
	});
	const effectiveCurrency = useCurrencyStore(state => state.currency);
	const [selectedCurrency, setCurrency] = useState<string | null>(initialDraft?.currency ?? null);
	const enteredCurrency = useRef<string | null>(null);
	const currency = selectedCurrency ?? enteredCurrency.current ?? effectiveCurrency;
	const client = useQueryClient();
	const [lender, setLender] = useState(initialDraft?.lender ?? "");
	const [localLender, setLocalLender] = useDebouncedInput(lender, setLender);
	const [firstDueDate, setFirstDueDate] = useState(initialDraft?.firstDueDate ?? getLocalDateKey);
	const [startDate, setStartDate] = useState(initialDraft?.startDate ?? getLocalDateKey);
	const [amortization, setAmortization] = useState<Loan["amortization"]>(
		initialDraft?.amortization ?? "PRICE",
	);
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent className="flex flex-col">
				<DialogHeader>
					<DialogTitle>Novo empréstimo</DialogTitle>
					<DialogDescription>
						Parcelas calculadas automaticamente conforme amortização.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div>
						<form
							className="space-y-4 pr-3"
							onInputCapture={event => {
								if (
									event.target instanceof HTMLInputElement &&
									event.target.name === "principalAmount"
								)
									enteredCurrency.current = currency;
							}}
							onSubmit={event => {
								event.preventDefault();
								const form = new FormData(event.currentTarget);
								const number = (key: string) =>
									Number(
										String(form.get(key))
											.replace(/[^\d,]/g, "")
											.replace(",", "."),
									);
								const input: LoanCreateInput = {
									amortization,
									currency,
									dueDay: Number(firstDueDate.slice(8, 10)),
									firstDueDate,
									installmentAmount: 0,
									institutionId,
									interestRate: number("interestRate") / 100,
									lender: String(form.get("lender") ?? localLender).trim(),
									principalAmount: number("principalAmount"),
									startDate,
									totalInstallments: number("totalInstallments"),
								};
								runBackgroundModalAction({
									cache: { client, operations: ["loan"] },
									close: onClose,
									conflictKey: "loan-create",
									failureMessage: "Não foi possível criar o empréstimo.",
									loadingMessage: "Criando empréstimo...",
									recovery: { kind: "loan-create", payload: input },
									run: () => dataService.loans.create(input),
									successMessage: "Empréstimo criado.",
								});
							}}
						>
							<div className="grid gap-2">
								<label htmlFor="loan-lender">
									Credor <RequiredMark />
								</label>
								<Input
									autoComplete="organization"
									id="loan-lender"
									name="lender"
									onChange={event => setLocalLender(event.currentTarget.value)}
									placeholder="Ex: Banco do Brasil"
									required
									type="text"
									value={localLender}
								/>
							</div>
							<CustomSelect
								label="Instituição financeira"
								onValueChange={setInstitutionId}
								options={(institutions.data ?? []).map(row => ({
									label: row.name,
									value: row.id,
								}))}
								placeholder="Ex: Banco do Brasil"
								required
								searchable
								value={institutionId}
							/>
							<CurrencySelect onValueChange={setCurrency} value={currency} />
							<LoanNumericField
								currencyCode={currency}
								initialValue={initialDraft ? String(initialDraft.principalAmount) : ""}
								label="Principal"
								money
								name="principalAmount"
							/>
							<LoanNumericField
								initialValue={initialDraft ? String(initialDraft.interestRate * 100) : ""}
								label="Juros mensais"
								name="interestRate"
								percentage
							/>
							<LoanNumericField
								initialValue={initialDraft ? String(initialDraft.totalInstallments) : ""}
								label="Número de parcelas"
								name="totalInstallments"
							/>
							<CustomSelect
								label="Amortização"
								onValueChange={value => setAmortization(value as Loan["amortization"])}
								options={[
									{ label: "PRICE (fixa)", value: "PRICE" },
									{ label: "SAC (decrescente)", value: "SAC" },
								]}
								placeholder="Escolha amortização"
								required
								value={amortization}
							/>
							<DateField
								id="loan-start"
								label="Início"
								name="startDate"
								onValueChange={setStartDate}
								required
								value={startDate}
							/>
							<DateField
								id="loan-first-due"
								label="Primeiro vencimento"
								name="firstDueDate"
								onValueChange={setFirstDueDate}
								required
								value={firstDueDate}
							/>
							<ActionGroup>
								<Button
									className="cursor-pointer"
									onClick={onClose}
									type="button"
									variant="outline"
								>
									Descartar
								</Button>
								<Button
									className="cursor-pointer"
									disabled={
										!institutionId || !localLender.trim() || !firstDueDate || !startDate
									}
									type="submit"
								>
									Salvar
								</Button>
							</ActionGroup>
						</form>
					</div>
				</DialogBody>
			</DialogContent>
		</Dialog>
	);
}
