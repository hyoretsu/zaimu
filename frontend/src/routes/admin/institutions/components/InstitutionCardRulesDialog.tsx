import { useQuery, useQueryClient } from "@tanstack/react-query";
import { defaultCardRules, type InstitutionCardRules } from "@zaimu/finance/institution-card-rules";
import { useState } from "react";
import { LuCreditCard } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
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
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useBackgroundModalRecovery } from "@/hooks/use-background-modal-recovery";
import {
	getFinancialInstitutionsByIdProfiles,
	patchFinancialInstitutionsReviewCatalogByIdCardRules,
} from "@/lib/api";
import { runBackgroundModalAction, useModalRecoveryStore } from "@/lib/background-modal-actions";
import { useCacheIdentity } from "@/lib/query-cache";
import { InstitutionCardRuleFields } from "./InstitutionCardRuleFields";
import type { AdminInstitution } from "./types";

const INSTITUTION = "__institution__";
export function InstitutionCardRulesDialog({ institution }: { institution: AdminInstitution }) {
	const [open, setOpen] = useState(false);
	const [scope, setScope] = useState(INSTITUTION);
	const [rules, setRules] = useState<InstitutionCardRules>(defaultCardRules);
	const [inherit, setInherit] = useState(false);
	const identity = useCacheIdentity();
	const conflictKey = `institution-card-rules:${institution.id}`;
	const pending = useModalRecoveryStore(state => !!state.pending[`${identity}:${conflictKey}`]);
	useBackgroundModalRecovery<{ scope: string; inherit: boolean; rules: InstitutionCardRules }>(
		conflictKey,
		entry => {
			setScope(entry.payload.scope);
			setInherit(entry.payload.inherit);
			setRules(entry.payload.rules);
			setOpen(true);
		},
	);
	const client = useQueryClient();
	const profiles = useQuery({
		enabled: open,
		queryFn: () => getFinancialInstitutionsByIdProfiles(institution.id),
		queryKey: ["admin-institution-card-profiles", identity, institution.id],
	});
	const choose = (id: string) => {
		const selected = profiles.data?.find(profile => profile.id === id)?.creditCardRules;
		setScope(id);
		setInherit(id !== INSTITUTION && !selected);
		setRules(selected ?? institution.creditCardRules ?? defaultCardRules);
	};
	const reward = rules.cashback;
	const invalid =
		reward &&
		(reward.rate <= 0 ||
			(reward.conversionPoints !== null &&
				(!(reward.conversionPoints > 0) || !(reward.conversionAmount! > 0))) ||
			(reward.yieldPeriod !== null &&
				(!(reward.yieldReferenceRate! > 0) || !(reward.yieldReferencePercentage! > 0))));
	return (
		<Dialog
			onOpenChange={value => {
				if (value) choose(INSTITUTION);
				setOpen(value);
			}}
			open={open}
		>
			<Tooltip>
				<TooltipTrigger asChild>
					<DialogTrigger asChild>
						<Button aria-label={`Regras dos cartões de ${institution.name}`} size="icon-sm" variant="outline">
							<LuCreditCard />
						</Button>
					</DialogTrigger>
				</TooltipTrigger>
				<TooltipContent>Regras dos cartões</TooltipContent>
			</Tooltip>
			<DialogContent className="sm:max-w-xl">
				<DialogHeader>
					<DialogTitle>Regras dos cartões - {institution.name}</DialogTitle>
					<DialogDescription>
						Defina cashback e vencimento padrão. Perfis podem herdar as regras ou liberar benefícios próprios.
					</DialogDescription>
				</DialogHeader>
				<form
					className="flex min-h-0 min-w-0 flex-1 flex-col gap-5"
					onSubmit={event => {
						event.preventDefault();
						if (pending || (!inherit && invalid) || !profiles.isSuccess) return;
						const draft = { inherit, rules, scope };
						runBackgroundModalAction({
							cache: { client, operations: ["institution"] },
							close: () => setOpen(false),
							conflictKey,
							failureMessage: "Não foi possível salvar as regras dos cartões.",
							loadingMessage: "Salvando regras dos cartões...",
							recovery: { entityId: institution.id, kind: conflictKey, payload: draft },
							run: () =>
								patchFinancialInstitutionsReviewCatalogByIdCardRules(institution.id, {
									profileId: draft.scope === INSTITUTION ? undefined : draft.scope,
									rules: draft.inherit ? null : draft.rules,
								}),
							successMessage: "Regras dos cartões salvas.",
						});
					}}
				>
					<DialogBody>
						<div className="space-y-4">
							{profiles.isPending ? (
								<>
									<Skeleton className="h-16" />
									<Skeleton className="h-40" />
								</>
							) : profiles.isError ? (
								<p role="alert">
									Não foi possível carregar os perfis.{" "}
									<Button onClick={() => void profiles.refetch()} type="button" variant="outline">
										Tentar novamente
									</Button>
								</p>
							) : (
								<fieldset className="min-w-0 space-y-4" disabled={pending}>
									<CustomSelect
										label="Aplicar regras a"
										onValueChange={choose}
										options={[
											{ label: "Padrão da instituição", special: true, value: INSTITUTION },
											...(profiles.data ?? []).map(profile => ({ label: profile.name, value: profile.id })),
										]}
										placeholder="Ex: Padrão da instituição"
										searchable
										value={scope}
									/>
									{scope !== INSTITUTION && (
										<CheckboxField
											checkboxProps={{
												checked: inherit,
												onCheckedChange: checked => setInherit(checked === true),
											}}
										>
											Herdar regras da instituição
										</CheckboxField>
									)}
									{inherit ? (
										<p className="text-muted-foreground text-sm">
											Este perfil acompanha as regras padrão da instituição.
										</p>
									) : (
										<InstitutionCardRuleFields onChange={setRules} value={rules} />
									)}
								</fieldset>
							)}
						</div>
					</DialogBody>
					<DialogFooter>
						<Button onClick={() => setOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button disabled={pending || !profiles.isSuccess || (!inherit && !!invalid)} type="submit">
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
