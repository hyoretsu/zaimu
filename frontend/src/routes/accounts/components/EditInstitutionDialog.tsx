import { useState } from "react";
import { LuPencil } from "react-icons/lu";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
import { FormField } from "@/components/ui/FormField";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialInstitution } from "@/lib/api";
import { countryCodes } from "@/lib/country-preference";
import { runDialogSave } from "@/lib/dialog-save";
import { showToast } from "@/stores";

export function EditInstitutionDialog({
	institution,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onUpdate: (
		institution: FinancialInstitution,
		name: string,
		currency: string,
		creditInstallmentRemainderOnFirst: boolean,
		operatingCountryCodes?: string[],
	) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useDebouncedInput(institution.name, () => undefined);
	const [currency, setCurrency] = useState(institution.currency ?? "BRL");
	const [countries, setCountries] = useState(institution.operatingCountryCodes ?? []);
	const countryNames = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "region" });
	const [remainderOnFirst, setRemainderOnFirst] = useState(
		institution.creditInstallmentRemainderOnFirst ?? false,
	);
	const save = () => {
		try {
			runDialogSave(
				onUpdate(institution, name.trim(), currency, remainderOnFirst, countries),
				() => setOpen(false),
				"Salvando instituição",
			);
		} catch {
			return;
		}
	};
	return (
		<Dialog
			onOpenChange={value => {
				if (value) {
					setName(institution.name);
					setCountries(institution.operatingCountryCodes ?? []);
					setCurrency(institution.currency ?? "BRL");
					setRemainderOnFirst(institution.creditInstallmentRemainderOnFirst ?? false);
				}
				setOpen(value);
			}}
			open={open}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button
							aria-label={`Editar ${institution.name}`}
							className="cursor-pointer"
							size="icon-sm"
							variant="outline"
						>
							<LuPencil />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Editar instituição</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Editar instituição</DialogTitle>
					<DialogDescription>
						Nome identifica grupo. Moeda padrão será usada nos novos cadastros.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						save();
					}}
				>
					<DialogBody>
						<CustomSelect
							label="Adicionar país de operação"
							onValueChange={value => {
								setCountries(current => [...current, value]);
								showToast("País incluído na proposta", "info");
							}}
							options={countryCodes
								.filter(code => !countries.includes(code))
								.map(value => ({ label: countryNames.of(value) ?? value, value }))}
							placeholder="Ex: Brasil"
							searchable
						/>
						<ActionGroup>
							{countries.map(code => (
								<Button
									key={code}
									onClick={() => {
										setCountries(current => current.filter(value => value !== code));
										showToast("País removido da proposta", "info");
									}}
									type="button"
									variant="outline"
								>
									{countryNames.of(code) ?? code} - Remover
								</Button>
							))}
						</ActionGroup>
						<p className="text-muted-foreground text-sm">
							Países sugerem novos cadastros. Contas podem operar em outros países. Alterações aguardam
							revisão administrativa.
						</p>

						<FormFieldRow>
							<FormField
								autoComplete="organization"
								id={`institution-${institution.id}`}
								label="Nome da instituição"
								name="institution-name"
								onChange={event => setName(event.currentTarget.value)}
								placeholder="Ex: Mercado Pago"
								required
								type="text"
								value={name}
							/>
							<CurrencySelect label="Moeda padrão" onValueChange={setCurrency} value={currency} />
						</FormFieldRow>
						<FormFieldRow>
							<CustomSelect
								label="Excedente do parcelamento"
								onValueChange={value => setRemainderOnFirst(value === "first")}
								options={[
									{ label: "Dividir igualmente", value: "distributed" },
									{ label: "Concentrar na primeira parcela", value: "first" },
								]}
								placeholder="Ex: Concentrar na primeira parcela"
								sortOptions={false}
								value={remainderOnFirst ? "first" : "distributed"}
							/>
						</FormFieldRow>
						<p className="text-muted-foreground text-sm">
							Define como os centavos restantes são divididos em novas compras parceladas. Compras já
							registradas mantêm seus valores.
						</p>
					</DialogBody>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => setOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!name.trim()}
							type="submit"
						>
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
