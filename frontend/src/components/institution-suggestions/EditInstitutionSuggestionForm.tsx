import { useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuSend, LuX } from "react-icons/lu";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { CustomSelect } from "@/components/ui/CustomSelect";
import { FormField } from "@/components/ui/FormField";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import type { FinancialInstitution } from "@/lib/api";
import { postFinancialInstitutionsByIdUpdateProposal } from "@/lib/api";
import { countryCodes, countryName } from "@/lib/countries";
import { captureCacheMutation, invalidateMutationCache, mutationCacheMeta } from "@/lib/mutation-cache";
import { showToast } from "@/stores";
import { InstitutionPicker } from "./InstitutionPicker";

const sameSet = (a: string[], b: string[]) => a.length === b.length && a.every(item => b.includes(item));

function EditFields({ institution, onClose }: { institution: FinancialInstitution; onClose: () => void }) {
	const queryClient = useQueryClient();
	const [name, setName] = useState(institution.name);
	const [aliases, setAliases] = useState((institution.aliases ?? []).join(", "));
	const [closingInclusive, setClosingInclusive] = useState(institution.creditStatementClosingInclusive);
	const currentCountries = institution.operatingCountryCodes ?? [];
	const [countries, setCountries] = useState(currentCountries);
	const [pending, setPending] = useState(false);
	const parsedAliases = aliases
		.split(",")
		.map(alias => alias.trim())
		.filter(Boolean);
	// Only what the author actually changed is sent, so the admin reviews a minimal diff.
	const changes = {
		...(name.trim() !== institution.name && { name: name.trim() }),
		...(!sameSet(parsedAliases, institution.aliases ?? []) && { aliases: parsedAliases }),
		...(closingInclusive !== institution.creditStatementClosingInclusive && {
			creditStatementClosingInclusive: closingInclusive,
		}),
		...(!sameSet(countries, currentCountries) && { operatingCountryCodes: countries }),
	};
	const changed = Object.keys(changes).length > 0;
	const submit = async () => {
		const start = captureCacheMutation();
		setPending(true);
		try {
			await postFinancialInstitutionsByIdUpdateProposal({
				body: changes,
				path: { id: institution.id },
			}).then(result => result.data);
			showToast("Sugestão enviada para revisão administrativa", "positive");
			await invalidateMutationCache(queryClient, start, {
				...mutationCacheMeta("institution"),
				awaitRefetch: true,
			});
			onClose();
		} catch (error) {
			showToast(
				error instanceof Error ? error.message : "Não foi possível enviar a sugestão",
				"negative",
			);
		} finally {
			setPending(false);
		}
	};
	return (
		<div className="grid gap-3">
			<FormField
				disabled={pending}
				id="suggest-edit-name"
				label="Nome da instituição"
				maxLength={100}
				name="suggest-edit-name"
				onChange={event => setName(event.currentTarget.value)}
				placeholder="Ex: Banco Inter"
				type="text"
				value={name}
			/>
			<FormField
				disabled={pending}
				id="suggest-edit-aliases"
				label="Outros nomes (separados por vírgula)"
				name="suggest-edit-aliases"
				onChange={event => setAliases(event.currentTarget.value)}
				placeholder="Ex: AUVP"
				type="text"
				value={aliases}
			/>
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
				onValueChange={code => setCountries(previous => [...previous, code])}
				options={countryCodes
					.filter(code => !countries.includes(code))
					.map(code => ({ label: countryName(code), value: code }))}
				placeholder="Ex: Brasil"
				searchable
			/>
			{countries.length === 0 ? (
				<p className="text-muted-foreground text-sm">Nenhum país configurado.</p>
			) : (
				<ul className="grid gap-2">
					{countries.map(code => (
						<li className="flex items-center gap-3 rounded-xl border p-3" key={code}>
							<span className="min-w-0 flex-1 font-medium">{countryName(code)}</span>
							<Tooltip>
								<TooltipTrigger asChild>
									<Button
										aria-label={`Remover ${countryName(code)}`}
										disabled={pending}
										onClick={() =>
											setCountries(previous => previous.filter(item => item !== code))
										}
										size="icon-sm"
										type="button"
										variant="outline"
									>
										<LuX />
									</Button>
								</TooltipTrigger>
								<TooltipContent>Remover país</TooltipContent>
							</Tooltip>
						</li>
					))}
				</ul>
			)}
			<p className="text-muted-foreground text-sm">
				Apenas os campos alterados são enviados. Um admin compara com o cadastro atual antes de
				aprovar.
			</p>
			<ActionGroup>
				<Button
					disabled={pending || !changed || !name.trim()}
					onClick={() => void submit()}
					type="button"
				>
					<LuSend />
					Enviar sugestão
				</Button>
			</ActionGroup>
		</div>
	);
}

export function EditInstitutionSuggestionForm({ onClose }: { onClose: () => void }) {
	const [institution, setInstitution] = useState<FinancialInstitution>();
	return (
		<div className="grid gap-3">
			<InstitutionPicker
				filter={item => item.status === "APPROVED"}
				onChange={setInstitution}
				value={institution?.id}
			/>
			{institution && <EditFields institution={institution} key={institution.id} onClose={onClose} />}
		</div>
	);
}
