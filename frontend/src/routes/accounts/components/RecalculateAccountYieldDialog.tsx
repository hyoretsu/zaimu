import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuRefreshCw } from "react-icons/lu";
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
import {
	type CustomHistoricalYieldSettings,
	recalculateAccountYield,
} from "@/lib/account-yield-recalculation";
import type { FinancialAccount } from "@/lib/api";
import { getFinancialInstitutionsByIdProfiles } from "@/lib/api";
import { useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { useAuthStore } from "@/stores/auth";

import { AccountYieldFields } from "./AccountYieldFields";

export function RecalculateAccountYieldDialog({ account }: { account: FinancialAccount }) {
	const [open, setOpen] = useState(false);
	const [selected, setSelected] = useState("current");
	const [custom, setCustom] = useState({
		enabled: true,
		fixedRate: "",
		period: "YEARLY" as "MONTHLY" | "YEARLY",
		referencePercentage: "100",
		referenceType: "" as "" | "CDI" | "SELIC",
		taxIds: [] as string[],
		taxRate: "",
	});
	const settings: CustomHistoricalYieldSettings | undefined =
		selected === "custom"
			? {
					yieldFixedRate: custom.fixedRate ? Number(custom.fixedRate) : null,
					yieldPeriod: custom.fixedRate ? custom.period : null,
					yieldReferencePercentage: custom.referenceType ? Number(custom.referencePercentage) : null,
					yieldReferenceType: custom.referenceType || null,
					yieldTaxIds: custom.taxIds,
					yieldTaxRate: custom.taxRate ? Number(custom.taxRate) : null,
				}
			: undefined;
	const customValid =
		custom.enabled &&
		(Boolean(custom.fixedRate) || Boolean(custom.referenceType)) &&
		(!custom.fixedRate || (Number.isFinite(Number(custom.fixedRate)) && Number(custom.fixedRate) > 0)) &&
		(!custom.referenceType ||
			(Number.isFinite(Number(custom.referencePercentage)) && Number(custom.referencePercentage) > 0)) &&
		(!custom.taxRate ||
			(Number.isFinite(Number(custom.taxRate)) &&
				Number(custom.taxRate) >= 0 &&
				Number(custom.taxRate) <= 100));
	const guest = useAuthStore(state => state.isGuestMode);
	const identity = useCacheIdentity();
	const client = useQueryClient();
	const profiles = useQuery({
		enabled: open && !guest && Boolean(account.institutionId),
		queryFn: () => {
			if (!account.institutionId) throw new Error("Instituição indisponível.");
			return getFinancialInstitutionsByIdProfiles(account.institutionId);
		},
		queryKey: ["institution-profiles", identity, account.institutionId],
	});
	const guestProfiles = [
		...new Set(
			account.institution?.yieldPolicies
				?.map(policy => policy.profileId)
				.filter((id): id is string => Boolean(id)),
		),
	].map(id => {
		const policy = account.institution?.yieldPolicies
			?.filter(policy => policy.profileId === id)
			.toSorted((a, b) => a.effectiveDate.localeCompare(b.effectiveDate))
			.at(-1);
		const rule = policy?.rules[0];
		const rate = rule?.yieldReferenceType
			? `${rule.yieldReferencePercentage ?? 100}% do ${rule.yieldReferenceType}`
			: `${rule?.yieldFixedRate ?? 0}% ${policy?.yieldPeriod === "MONTHLY" ? "ao mês" : "ao ano"}`;
		return { id, name: `${rate} - desde ${policy?.effectiveDate.slice(0, 10)}` };
	});
	const mutation = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: () =>
			recalculateAccountYield(
				account.id,
				selected === "current" || selected === "custom" ? undefined : selected,
				settings,
			),
		onError: error => showToast(error.message, "negative"),
		onSuccess: async () => {
			showToast(
				guest ? "Rendimento histórico recalculado." : "Recálculo do rendimento histórico solicitado.",
				"positive",
			);
			setOpen(false);
		},
	});
	const loading = !guest && Boolean(account.institutionId) && profiles.isPending;
	return (
		<Dialog
			onOpenChange={next => {
				setOpen(next);
				if (next) {
					setSelected("current");
					setCustom({
						enabled: true,
						fixedRate: "",
						period: "YEARLY",
						referencePercentage: "100",
						referenceType: "",
						taxIds: [],
						taxRate: "",
					});
					mutation.reset();
				}
			}}
			open={open}
		>
			<DialogTrigger asChild>
				<Button
					className="mt-2 w-full cursor-pointer"
					disabled={mutation.isPending}
					size="sm"
					variant="outline"
				>
					<LuRefreshCw /> Recalcular rendimento
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Recalcular rendimento histórico</DialogTitle>
					<DialogDescription>
						Escolha a regra aplicada ao histórico desta conta até hoje. A configuração dos próximos dias será
						mantida. Lançamentos manuais, rendimentos ajustados e exclusões serão preservados.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<CustomSelect
						disabled={mutation.isPending}
						label="Regra de rendimento"
						onValueChange={setSelected}
						options={[
							{ label: "Regra atual da conta", special: true, value: "current" },
							{ label: "Outra regra personalizada", special: true, value: "custom" },
							...(guest ? guestProfiles : (profiles.data ?? [])).map(profile => ({
								label: profile.name,
								value: profile.id,
							})),
						]}
						placeholder="Selecione a regra"
						required
						searchable
						value={selected}
					/>
					{selected === "custom" && (
						<fieldset className="mt-4 min-w-0" disabled={mutation.isPending}>
							<AccountYieldFields
								allowReference={!guest}
								enabled={custom.enabled}
								fixedRate={custom.fixedRate}
								onEnabledChange={enabled => setCustom(previous => ({ ...previous, enabled }))}
								onFixedRateChange={fixedRate => setCustom(previous => ({ ...previous, fixedRate }))}
								onPeriodChange={period => setCustom(previous => ({ ...previous, period }))}
								onReferencePercentageChange={referencePercentage =>
									setCustom(previous => ({ ...previous, referencePercentage }))
								}
								onReferenceTypeChange={referenceType =>
									setCustom(previous => ({ ...previous, referenceType }))
								}
								onTaxIdsChange={taxIds => setCustom(previous => ({ ...previous, taxIds }))}
								onTaxRateChange={taxRate => setCustom(previous => ({ ...previous, taxRate }))}
								period={custom.period}
								referencePercentage={custom.referencePercentage}
								referenceType={custom.referenceType}
								taxIds={custom.taxIds}
								taxRate={custom.taxRate}
							/>
						</fieldset>
					)}
					{loading && (
						<p className="mt-3 text-muted-foreground text-sm" role="status">
							Carregando outras regras...
						</p>
					)}
					{profiles.isError && !guest && (
						<div className="mt-3 space-y-2">
							<p className="text-destructive text-sm">
								Não foi possível carregar outras regras. A regra atual continua disponível.
							</p>
							<Button onClick={() => profiles.refetch()} variant="outline">
								Tentar novamente
							</Button>
						</div>
					)}
					{guest && (
						<p className="mt-3 text-muted-foreground text-sm">
							No modo visitante, recálculo disponível para taxas fixas. CDI e SELIC exigem histórico oficial
							de uma conta conectada.
						</p>
					)}
					{mutation.isPending && (
						<p className="mt-3 text-muted-foreground text-sm" role="status">
							Recalculando rendimento histórico...
						</p>
					)}
					{mutation.isError && (
						<p className="mt-3 text-destructive text-sm" role="alert">
							{mutation.error.message}
						</p>
					)}
				</DialogBody>
				<DialogFooter>
					<Button disabled={mutation.isPending} onClick={() => setOpen(false)} variant="outline">
						Descartar
					</Button>
					<Button
						disabled={
							mutation.isPending ||
							(selected === "custom" ? !customValid : selected !== "current" && (loading || profiles.isError))
						}
						onClick={() => mutation.mutate()}
					>
						<LuRefreshCw /> Recalcular
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
