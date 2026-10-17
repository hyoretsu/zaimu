import { useMutation } from "@tanstack/react-query";
import { type TaxBracket, type TaxDefinition, validateTaxBrackets } from "@zaimu/finance/yield-tax";
import { useState } from "react";
import { LuMinus, LuPlus } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Input } from "@/components/ui/Input";
import { NumericField } from "@/components/ui/NumericField";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { postAdminTaxes, putAdminTaxesById } from "@/lib/api";
import { mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";
import { TaxBracketFields } from "./TaxBracketFields";
export function TaxEditor({ tax, onClose }: { tax: TaxDefinition | null; onClose: () => void }) {
	const latest = tax?.versions.at(-1);
	const [name, setName] = useDebouncedInput(tax?.name ?? "", () => undefined);
	const [order, setOrder] = useDebouncedInput(String(latest?.applicationOrder ?? 2), () => undefined);
	const [brackets, setBrackets] = useState<TaxBracket[]>(
		() => latest?.brackets.map(bracket => ({ ...bracket })) ?? [{ rate: 0, upToDays: null }],
	);
	const [error, setError] = useState("");
	const save = useMutation({
		meta: mutationCacheMeta("tax"),
		mutationFn: () => {
			const data = { applicationOrder: Number(order), brackets, name: name.trim() };
			return tax ? putAdminTaxesById(tax.id, data) : postAdminTaxes(data);
		},
		onError: error => setError(error.message),
		onSuccess: () => {
			showToast("Imposto salvo. Novas faixas valem amanhã.", "positive");
			onClose();
		},
	});
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !save.isPending) onClose();
			}}
			open
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>{tax ? "Editar imposto" : "Cadastrar imposto"}</DialogTitle>
					<DialogDescription>IOF antes do IR. Alterações nas faixas passam a valer amanhã.</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={event => {
						event.preventDefault();
						try {
							validateTaxBrackets(brackets);
							setError("");
							save.mutate();
						} catch (error) {
							setError((error as Error).message);
						}
					}}
				>
					<DialogBody>
						<div className="grid gap-4">
							<FormFieldRow>
								<label className="grid gap-2" htmlFor="admin-tax-name">
									<span>
										Nome <RequiredMark />
									</span>
									<Input
										id="admin-tax-name"
										name="tax-name"
										onChange={event => setName(event.currentTarget.value)}
										placeholder="Ex: IR regressivo"
										required
										value={name}
									/>
								</label>
								<NumericField
									decimalScale={0}
									id="tax-order"
									label="Ordem de aplicação"
									onValueChange={setOrder}
									placeholder="Ex: 1"
									required
									value={order}
								/>
							</FormFieldRow>
							<div className="grid gap-2">
								<div aria-hidden="true" className="grid grid-cols-2 gap-4 font-medium text-sm">
									<span>
										Até quantos dias <RequiredMark />
									</span>
									<span>
										Alíquota <RequiredMark />
									</span>
								</div>
								{brackets.map((bracket, index) => (
									<TaxBracketFields
										bracket={bracket}
										index={index}
										key={index}
										last={index === brackets.length - 1}
										onChange={value =>
											setBrackets(current =>
												current.map((item, position) => (position === index ? value : item)),
											)
										}
									/>
								))}
							</div>
							<ActionGroup>
								<Button
									disabled={brackets.length >= 100}
									onClick={() => {
										setBrackets(current => [
											...current.slice(0, -1),
											{ rate: 0, upToDays: (current.at(-2)?.upToDays ?? -1) + 1 },
											current.at(-1)!,
										]);
										showToast("Faixa adicionada.");
									}}
									type="button"
									variant="outline"
								>
									<LuPlus />
									Adicionar faixa
								</Button>
								<Button
									disabled={brackets.length <= 1}
									onClick={() => {
										setBrackets(current => [...current.slice(0, -2), current.at(-1)!]);
										showToast("Última faixa limitada removida.");
									}}
									type="button"
									variant="outline"
								>
									<LuMinus />
									Remover faixa
								</Button>
							</ActionGroup>
							{error && (
								<p className="text-destructive" role="alert">
									{error}
								</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button disabled={save.isPending} onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button disabled={save.isPending} type="submit">
							{save.isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
