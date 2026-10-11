import { useMutation, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { CurrencySelect } from "@/components/currency/CurrencySelect";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { DateField } from "@/components/ui/DateField";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { FormFieldRow } from "@/components/ui/FormFieldRow";
import { Input } from "@/components/ui/Input";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { fetchWithAuth } from "@/lib/dataService";
import type { YieldCalendar } from "@/lib/yield-calendar";
import { showToast } from "@/stores";
import type { CalendarEditing } from "./types";
export function CalendarEditor({
	catalog,
	editing,
	onClose,
}: {
	catalog: YieldCalendar;
	editing: CalendarEditing;
	onClose: () => void;
}) {
	const [code, setCode] = useDebouncedInput(
		editing.kind === "country" ? (editing.value?.code ?? "") : "",
		() => undefined,
	);
	const [name, setName] = useDebouncedInput(
		editing.kind === "currency" ? "" : (editing.value?.name ?? ""),
		() => undefined,
	);
	const [countryCode, setCountryCode] = useState(
		editing.kind === "country" ? "" : (editing.value?.countryCode ?? ""),
	);
	const [currency, setCurrency] = useState(
		editing.kind === "currency" ? (editing.value?.currency ?? "BRL") : "BRL",
	);
	const [date, setDate] = useState(editing.kind === "holiday" ? (editing.value?.date ?? "") : "");
	const client = useQueryClient();
	const save = useMutation({
		mutationFn: () => {
			if (editing.kind === "country")
				return fetchWithAuth(`/admin/yield-calendar/countries/${code}`, {
					body: JSON.stringify({
						currencies: catalog.currencyCountries
							.filter(row => row.countryCode === code)
							.map(row => row.currency),
						name,
					}),
					method: "PUT",
				});
			if (editing.kind === "currency")
				return fetchWithAuth(`/admin/yield-calendar/currencies/${currency}`, {
					body: JSON.stringify({ countryCode, previousCountryCode: editing.value?.countryCode }),
					method: "PUT",
				});
			return fetchWithAuth(
				editing.value
					? `/admin/yield-calendar/holidays/${editing.value.id}`
					: `/admin/yield-calendar/countries/${countryCode}/holidays`,
				{ body: JSON.stringify({ date, name }), method: editing.value ? "PUT" : "POST" },
			);
		},
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: ["yield-calendar"] });
			showToast("Calendário salvo. Recálculo solicitado.", "positive");
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
					<DialogTitle>
						{editing.value ? "Editar" : "Cadastrar"}{" "}
						{editing.kind === "country" ? "país" : editing.kind === "currency" ? "associação" : "feriado"}
					</DialogTitle>
				</DialogHeader>
				<form
					className="flex min-h-0 flex-1 flex-col"
					onSubmit={event => {
						event.preventDefault();
						save.mutate();
					}}
				>
					<DialogBody>
						<div className="grid gap-4">
							<FormFieldRow>
								{editing.kind === "country" ? (
									<label className="grid min-w-0 gap-2" htmlFor="calendar-country-code">
										<span>
											Código ISO <RequiredMark />
										</span>
										<Input
											autoComplete="country"
											disabled={Boolean(editing.value)}
											id="calendar-country-code"
											maxLength={2}
											name="country-code"
											onChange={event => setCode(event.currentTarget.value.toUpperCase())}
											pattern="[A-Z]{2}"
											placeholder="Ex: BR"
											required
											value={code}
										/>
									</label>
								) : (
									<CustomSelect
										disabled={editing.kind === "holiday" && Boolean(editing.value)}
										label="País"
										onValueChange={setCountryCode}
										options={catalog.countries.map(country => ({
											label: `${country.name} (${country.code})`,
											value: country.code,
										}))}
										placeholder="Ex: Brasil"
										required
										searchable
										value={countryCode}
									/>
								)}
								{editing.kind === "currency" ? (
									<CurrencySelect
										disabled={Boolean(editing.value)}
										onValueChange={setCurrency}
										value={currency}
									/>
								) : (
									<label className="grid min-w-0 gap-2" htmlFor="calendar-name">
										<span>
											Nome <RequiredMark />
										</span>
										<Input
											autoComplete={editing.kind === "country" ? "country-name" : undefined}
											id="calendar-name"
											name={editing.kind === "country" ? "country-name" : "holiday-name"}
											onChange={event => setName(event.currentTarget.value)}
											placeholder={editing.kind === "country" ? "Ex: Brasil" : "Ex: Independência do Brasil"}
											required
											value={name}
										/>
									</label>
								)}
							</FormFieldRow>
							{editing.kind === "holiday" && (
								<DateField
									id="holiday-date"
									label="Data"
									name="holiday-date"
									onValueChange={setDate}
									required
									value={date}
								/>
							)}
							{save.isError && (
								<p className="text-destructive" role="alert">
									{save.error.message}
								</p>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button disabled={save.isPending} onClick={onClose} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							disabled={
								save.isPending ||
								(editing.kind !== "country" && !countryCode) ||
								(editing.kind === "holiday" && !date)
							}
							type="submit"
						>
							{save.isPending ? "Salvando..." : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
