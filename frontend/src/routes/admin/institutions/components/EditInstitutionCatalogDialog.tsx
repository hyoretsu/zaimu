import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil, LuX } from "react-icons/lu";
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
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { countryCodes } from "@/lib/countries";
import { fetchWithAuth } from "@/lib/dataService";
import { showToast } from "@/stores";
import { useCurrencyStore } from "@/stores/currency";
import type { AdminInstitution } from "./types";

export function EditInstitutionCatalogDialog({ institution }: { institution: AdminInstitution }) {
	const queryClient = useQueryClient();
	const currencies = useCurrencyStore(state => state.currencies);
	const [open, setOpen] = useState(false);
	const [pending, setPending] = useState(false);
	const [closingInclusive, setClosingInclusive] = useState(false);
	const [mapping, setMapping] = useState<Record<string, string[]>>({});
	const countryNames = new Intl.DisplayNames("pt-BR", { type: "region" });
	const currencyNames = new Intl.DisplayNames("pt-BR", { type: "currency" });
	const save = async () => {
		setPending(true);
		try {
			await fetchWithAuth(`/financial-institutions/review/catalog/${institution.id}`, {
				body: JSON.stringify({
					accountCurrenciesByCountry: mapping,
					creditStatementClosingInclusive: closingInclusive,
				}),
				method: "PATCH",
			});
			await queryClient.invalidateQueries();
			showToast("Configurações da instituição salvas", "positive");
			setOpen(false);
		} catch (error) {
			showToast(error instanceof Error ? error.message : "Não foi possível salvar a instituição", "negative");
		} finally {
			setPending(false);
		}
	};
	return (
		<Dialog
			onOpenChange={value => {
				if (pending) return;
				if (value) {
					setClosingInclusive(institution.creditStatementClosingInclusive ?? false);
					setMapping(
						Object.fromEntries(
							[
								...new Set([
									...(institution.operatingCountryCodes ?? []),
									...Object.keys(institution.accountCurrenciesByCountry ?? {}),
								]),
							].map(code => [code, [...(institution.accountCurrenciesByCountry?.[code] ?? [])]]),
						),
					);
				}
				setOpen(value);
			}}
			open={open}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button aria-label={`Configurar ${institution.name}`} size="icon-sm" variant="outline">
							<LuPencil />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Configurar instituição</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Configurar instituição - {institution.name}</DialogTitle>
					<DialogDescription>
						Defina os países, as moedas e a regra de fechamento das faturas.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						void save();
					}}
				>
					<DialogBody>
						<div className="space-y-4">
							<CustomSelect
								disabled={pending}
								label="Data de fechamento da fatura"
								onValueChange={value => setClosingInclusive(value === "inclusive")}
								options={[
									{
										label: "Exclusiva - compras do dia entram na próxima fatura (padrão)",
										value: "exclusive",
									},
									{ label: "Inclusiva - compras do dia entram na fatura atual", value: "inclusive" },
								]}
								placeholder="Ex: Exclusiva"
								value={closingInclusive ? "inclusive" : "exclusive"}
							/>

							<CustomSelect
								disabled={pending}
								label="Adicionar país de operação"
								onValueChange={code => {
									setMapping(previous => ({ ...previous, [code]: [] }));
									showToast("País adicionado à edição", "info");
								}}
								options={countryCodes
									.filter(code => !(code in mapping))
									.map(code => ({ label: countryNames.of(code) ?? code, value: code }))}
								placeholder="Ex: Brasil"
								searchable
							/>
							{Object.entries(mapping).map(([country, selected]) => (
								<section className="min-w-0 space-y-3 rounded-xl border p-3" key={country}>
									<div className="flex items-center gap-3">
										<h3 className="min-w-0 flex-1 font-medium">{countryNames.of(country) ?? country}</h3>
										<ActionGroup>
											<Tooltip>
												<TooltipTrigger asChild>
													<Button
														aria-label={`Remover ${countryNames.of(country) ?? country}`}
														disabled={pending}
														onClick={() => {
															setMapping(previous =>
																Object.fromEntries(
																	Object.entries(previous).filter(([code]) => code !== country),
																),
															);
															showToast("País removido da edição", "info");
														}}
														size="icon-sm"
														type="button"
														variant="outline"
													>
														<LuX />
													</Button>
												</TooltipTrigger>
												<TooltipContent>Remover país</TooltipContent>
											</Tooltip>
										</ActionGroup>
									</div>
									<CustomSelect
										disabled={pending}
										label="Moedas de contas"
										onValueChange={currency =>
											setMapping(previous => ({
												...previous,
												[country]: selected.includes(currency)
													? selected.filter(code => code !== currency)
													: [...selected, currency],
											}))
										}
										options={[...new Set([...currencies, ...selected])].map(code => ({
											label: `${code} - ${currencyNames.of(code) ?? code}`,
											value: code,
										}))}
										placeholder="Ex: BRL - Real brasileiro"
										required
										searchable
										values={selected}
									/>
								</section>
							))}
							{Object.keys(mapping).length === 0 && (
								<p className="text-muted-foreground text-sm">Nenhum país configurado.</p>
							)}
							{pending && (
								<p className="text-muted-foreground text-sm" role="status">
									Salvando instituição...
								</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button disabled={pending} onClick={() => setOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							disabled={pending || Object.values(mapping).some(values => values.length === 0)}
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
