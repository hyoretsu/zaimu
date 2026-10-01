import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { Input } from "@/components/ui/Input";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { Loan } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalDateKey } from "@/lib/date";
import { invalidateCacheOperation, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { LoanNumericField } from "./LoanNumericField";
export function LoanCreateDialog({ onClose }: { onClose: () => void }) {
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const [lender, setLender] = useState("");
	const [localLender, setLocalLender] = useDebouncedInput(lender, setLender);
	const [firstDueDate, setFirstDueDate] = useState(getLocalDateKey);
	const [startDate, setStartDate] = useState(getLocalDateKey);
	const [amortization, setAmortization] = useState<Loan["amortization"]>("PRICE");
	const create = useMutation({
		mutationFn: dataService.loans.create,
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			await invalidateCacheOperation(client, identity!, "loan");
			showToast("Empréstimo criado", "positive");
			onClose();
		},
	});
	return (
		<Dialog
			modal
			onOpenChange={open => {
				if (!open) onClose();
			}}
			open
		>
			<DialogContent className="flex max-h-[85dvh] flex-col overflow-hidden">
				<DialogHeader>
					<DialogTitle>Novo empréstimo</DialogTitle>
					<DialogDescription>Parcelas calculadas automaticamente conforme amortização.</DialogDescription>
				</DialogHeader>
				<ScrollArea className="min-h-0 flex-1">
					<form
						className="space-y-4 pr-3"
						onSubmit={event => {
							event.preventDefault();
							const form = new FormData(event.currentTarget);
							const number = (key: string) =>
								Number(
									String(form.get(key))
										.replace(/[^\d,]/g, "")
										.replace(",", "."),
								);
							create.mutate({
								amortization,
								dueDay: Number(firstDueDate.slice(8, 10)),
								firstDueDate,
								installmentAmount: 0,
								interestRate: number("interestRate") / 100,
								lender: localLender.trim(),
								principalAmount: number("principalAmount"),
								startDate,
								totalInstallments: number("totalInstallments"),
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
						<LoanNumericField label="Principal" money name="principalAmount" />
						<LoanNumericField label="Juros mensais" name="interestRate" percentage />
						<LoanNumericField label="Número de parcelas" name="totalInstallments" />
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
						<div className="flex gap-2">
							<Button className="cursor-pointer" onClick={onClose} type="button" variant="outline">
								Descartar
							</Button>
							<Button
								className="cursor-pointer"
								disabled={create.isPending || !localLender.trim() || !firstDueDate || !startDate}
								type="submit"
							>
								{create.isPending ? "Criando..." : "Salvar"}
							</Button>
						</div>
					</form>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
