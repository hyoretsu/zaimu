import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuPencil, LuPlus, LuTrash2 } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Skeleton } from "@/components/ui/Skeleton";
import { countryName } from "@/lib/countries";
import { fetchWithAuth } from "@/lib/dataService";
import { fetchYieldCalendar } from "@/lib/yield-calendar";
import { showToast } from "@/stores";
import { CalendarEditor } from "./CalendarEditor";
import type { CalendarEditing } from "./types";
export function CalendarContent() {
	const catalog = useQuery({
		queryFn: fetchYieldCalendar,
		queryKey: ["yield-calendar"],
	});
	const [editing, setEditing] = useState<CalendarEditing | null>(null);
	const [pending, setPending] = useState<string[]>([]);
	const client = useQueryClient();
	const remove = useMutation({
		mutationFn: (id: string) => fetchWithAuth(`/admin/yield-calendar/holidays/${id}`, { method: "DELETE" }),
		onError: error => showToast(error.message, "negative"),
		onMutate: id => setPending(ids => [...ids, id]),
		onSettled: (_data, _error, id) => setPending(ids => ids.filter(value => value !== id)),
		onSuccess: async () => {
			await client.invalidateQueries({ queryKey: ["yield-calendar"] });
			showToast("Feriado removido. Recálculo solicitado.", "positive");
		},
	});
	if (catalog.isPending)
		return (
			<div className="grid gap-4 p-4">
				<Skeleton className="h-10 w-64" />
				<Skeleton className="h-64 w-full" />
			</div>
		);
	if (catalog.isError)
		return (
			<div>
				<p role="alert">{catalog.error.message}</p>
				<ActionGroup>
					<Button onClick={() => void catalog.refetch()} variant="outline">
						Tentar novamente
					</Button>
				</ActionGroup>
			</div>
		);
	return (
		<div className="grid min-w-0 gap-6">
			<ActionGroup>
				<Button onClick={() => setEditing({ kind: "country", value: null })}>
					<LuPlus />
					Cadastrar país
				</Button>
				<Button
					disabled={!catalog.data.countries.length}
					onClick={() => setEditing({ kind: "currency", value: null })}
					variant="outline"
				>
					<LuPlus />
					Associar moeda
				</Button>
				<Button
					disabled={!catalog.data.countries.length}
					onClick={() => setEditing({ kind: "holiday", value: null })}
					variant="outline"
				>
					<LuPlus />
					Cadastrar feriado
				</Button>
			</ActionGroup>
			<section className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-6">
				<h2 className="font-semibold">Países</h2>
				{catalog.data.countries.map(country => (
					<div
						className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"
						key={country.code}
					>
						<p>{countryName(country.code)}</p>
						<ActionGroup>
							<Button onClick={() => setEditing({ kind: "country", value: country })} variant="outline">
								<LuPencil />
								Editar
							</Button>
						</ActionGroup>
					</div>
				))}
			</section>
			<section className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-6">
				<h2 className="font-semibold">Moedas e países</h2>
				{catalog.data.currencyCountries.map(mapping => (
					<div
						className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"
						key={`${mapping.countryCode}:${mapping.currency}`}
					>
						<p>
							{mapping.currency} - {countryName(mapping.countryCode)}
						</p>
						<ActionGroup>
							<Button onClick={() => setEditing({ kind: "currency", value: mapping })} variant="outline">
								<LuPencil />
								Editar
							</Button>
						</ActionGroup>
					</div>
				))}
			</section>
			<section className="grid gap-3 rounded-2xl border bg-card p-4 sm:p-6">
				<h2 className="font-semibold">Feriados</h2>
				{!catalog.data.holidays.length && <p>Nenhum feriado cadastrado.</p>}
				{catalog.data.holidays.map(holiday => (
					<div
						className="flex flex-wrap items-center justify-between gap-3 rounded-xl border bg-background/50 p-4"
						key={holiday.id}
					>
						<p>
							{holiday.date.split("-").reverse().join("/")} - {holiday.name} (
							{countryName(holiday.countryCode)})
						</p>
						<ActionGroup>
							<Button
								disabled={pending.includes(holiday.id)}
								onClick={() => setEditing({ kind: "holiday", value: holiday })}
								variant="outline"
							>
								<LuPencil />
								Editar
							</Button>
							<ConfirmActionButton
								confirmation="Excluir este feriado?"
								confirmChildren={
									<>
										<LuTrash2 />
										Confirmar
									</>
								}
								disabled={pending.includes(holiday.id)}
								onConfirm={() => remove.mutateAsync(holiday.id).then(() => undefined)}
								variant="outline"
							>
								<LuTrash2 />
								Excluir
							</ConfirmActionButton>
						</ActionGroup>
					</div>
				))}
			</section>
			{editing && (
				<CalendarEditor catalog={catalog.data} editing={editing} onClose={() => setEditing(null)} />
			)}
		</div>
	);
}
