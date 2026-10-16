import { useQuery } from "@tanstack/react-query";
import { type SyntheticEvent, useState } from "react";
import { LuPencil, LuPlus } from "react-icons/lu";
import { CurrencySelect } from "@/components/currency";
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
import { FormField } from "@/components/ui/FormField";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { runDialogSave } from "@/lib/dialog-save";
import { useCacheIdentity } from "@/lib/query-cache";
import { useAuthStore } from "@/stores/auth";
import { AccountYieldFields } from "./AccountYieldFields";
import { CardPayerFields } from "./CardPayerFields";
import { InstitutionAssociationProfile } from "./InstitutionAssociationProfile";
import { RecalculateCurrentDayYieldDialog } from "./RecalculateCurrentDayYieldDialog";

const types = [
	{ label: "Conta corrente", value: "CHECKING" },
	{ label: "Poupança", value: "SAVINGS" },
	{ label: "Investimentos", value: "INVESTMENT" },
	{ label: "Dinheiro", value: "CASH" },
	{ label: "Cartão de crédito", value: "CREDIT_CARD" },
	{ label: "Pontos / cashback", value: "REWARDS" },
];
const days = Array.from({ length: 31 }, (_, index) => ({
	label: `Dia ${index + 1}`,
	value: String(index + 1),
}));

type Draft = Parameters<typeof import("@/lib/dataService").dataService.accounts.create>[0];
type UpdateDraft = import("@/lib/dataService").FinancialAccountUpdateDraft;

export function CreateFinancialAccountDialog({
	contextual = false,
	account,
	defaultType,
	cardOnly = false,
	defaultInstitutionId,
	institutions: associatedInstitutions = [],
	onCreate,
	onOpenChange,
	onUpdate,
	open: controlledOpen,
	pending,
	showTrigger = true,
	iconOnly = false,
}: {
	account?: FinancialAccount;
	contextual?: boolean;
	defaultType?: FinancialAccount["type"];
	cardOnly?: boolean;
	defaultInstitutionId?: string | null;
	institutions?: FinancialInstitution[];
	rewardAccounts?: FinancialAccount[];
	onCreate: (data: Draft) => Promise<unknown>;
	onOpenChange?: (open: boolean) => void;
	onUpdate?: (id: string, data: UpdateDraft) => Promise<unknown>;
	open?: boolean;
	pending: boolean;
	showTrigger?: boolean;
	iconOnly?: boolean;
}) {
	const identity = useCacheIdentity();
	const hasAccess = useAuthStore(state => state.isAuthenticated || state.isGuestMode);
	const catalog = useQuery({
		enabled: hasAccess,
		queryFn: () => dataService.financialInstitutions.getAll(),
		queryKey: ["institutions", identity],
	});
	const institutions = [
		...new Map([...associatedInstitutions, ...(catalog.data ?? [])].map(item => [item.id, item])).values(),
	];
	const initialInstitution = () => account?.institutionId ?? defaultInstitutionId ?? undefined;
	const initialCurrency = () => account?.currency ?? "";
	const [selectedCurrency, setCurrency] = useState(initialCurrency);
	const [selectedCountry, setCountry] = useState(account?.countryCode ?? undefined);
	const [internalOpen, setInternalOpen] = useState(false);
	const isGuestMode = useAuthStore(state => state.isGuestMode);
	const open = controlledOpen ?? internalOpen;
	const [institutionId, setInstitutionId] = useState<string | undefined>(initialInstitution);
	const institution = institutions.find(item => item.id === institutionId);
	const availableCountries = institution ? (institution.operatingCountryCodes ?? []) : [];
	const countryCode =
		selectedCountry && availableCountries.includes(selectedCountry)
			? selectedCountry
			: availableCountries.length === 1
				? availableCountries[0]
				: undefined;
	const availableCurrencies = institution
		? (institution.accountCurrenciesByCountry?.[countryCode ?? ""] ?? [])
		: [];
	const currency = availableCurrencies.includes(selectedCurrency)
		? selectedCurrency
		: availableCurrencies.length === 1
			? availableCurrencies[0]!
			: "";
	const countryNames = new Intl.DisplayNames(document.documentElement.lang || "pt-BR", { type: "region" });
	const [name, setName] = useDebouncedInput(account?.name ?? "", () => undefined);
	const [type, setType] = useState<FinancialAccount["type"]>(account?.type ?? defaultType ?? "CHECKING");
	const [paymentAccountId, setPaymentAccountId] = useState<string | null>(
		account?.creditCard?.paymentAccountId ?? null,
	);
	const [paymentSuggestionsEnabled, setPaymentSuggestionsEnabled] = useState(
		account?.creditCard?.paymentSuggestionsEnabled ?? true,
	);
	const [creditLimit, setCreditLimit] = useState(String(account?.creditCard?.creditLimit ?? ""));
	const [securityDeposit, setSecurityDeposit] = useState(String(account?.creditCard?.securityDeposit ?? ""));
	const [statementDay, setStatementDay] = useState(String(account?.creditCard?.statementDay ?? 10));
	const [dueDay, setDueDay] = useState(String(account?.creditCard?.dueDay ?? 17));
	const [excludeFromTotals, setExcludeFromTotals] = useState(account?.creditCard?.excludeFromTotals ?? false);
	const [yieldEnabled, setYieldEnabled] = useState(
		Boolean(account?.yieldFixedRate || (!isGuestMode && account?.yieldReferenceType)),
	);
	const [yieldFixedRate, setYieldFixedRate] = useDebouncedInput(
		String(account?.yieldFixedRate ?? ""),
		() => undefined,
	);
	const [yieldReferenceType, setYieldReferenceType] = useState<"" | "CDI" | "SELIC">(
		isGuestMode ? "" : (account?.yieldReferenceType ?? ""),
	);
	const [yieldReferencePercentage, setYieldReferencePercentage] = useDebouncedInput(
		String(account?.yieldReferencePercentage ?? 100),
		() => undefined,
	);
	const [yieldTaxIds, setYieldTaxIds] = useState<string[]>(account?.yieldTaxIds ?? []);
	const [yieldTaxRate, setYieldTaxRate] = useDebouncedInput(
		String(account?.yieldTaxRate ?? ""),
		() => undefined,
	);
	const [yieldPeriod, setYieldPeriod] = useState<"MONTHLY" | "YEARLY">(account?.yieldPeriod ?? "MONTHLY");
	const [isRecalculateCurrentDayYieldDialogOpen, setIsRecalculateCurrentDayYieldDialogOpen] = useState(false);
	const [rewardsKind, setRewardsKind] = useState(account?.rewardsAccount?.kind ?? "POINTS");
	const [initialRewardsBalance, setInitialRewardsBalance] = useDebouncedInput(
		String(account?.rewardsAccount?.initialBalance ?? ""),
		() => undefined,
	);
	const [conversionEnabled, setConversionEnabled] = useState(
		Boolean(account?.rewardsAccount?.conversionPoints && account.rewardsAccount.conversionAmount),
	);
	const [conversionPoints, setConversionPoints] = useDebouncedInput(
		String(account?.rewardsAccount?.conversionPoints ?? ""),
		() => undefined,
	);
	const [conversionAmount, setConversionAmount] = useDebouncedInput(
		String(account?.rewardsAccount?.conversionAmount ?? ""),
		() => undefined,
	);

	const reset = () => {
		setCurrency(initialCurrency());
		setCountry(account?.countryCode ?? undefined);
		setInstitutionId(initialInstitution());
		setName(account?.name ?? "");
		setType(account?.type ?? defaultType ?? "CHECKING");
		setCreditLimit(String(account?.creditCard?.creditLimit ?? ""));
		setSecurityDeposit(String(account?.creditCard?.securityDeposit ?? ""));
		setStatementDay(String(account?.creditCard?.statementDay ?? 10));
		setDueDay(String(account?.creditCard?.dueDay ?? 17));
		setPaymentAccountId(account?.creditCard?.paymentAccountId ?? null);
		setPaymentSuggestionsEnabled(account?.creditCard?.paymentSuggestionsEnabled ?? true);
		setExcludeFromTotals(account?.creditCard?.excludeFromTotals ?? false);
		setYieldEnabled(Boolean(account?.yieldFixedRate || (!isGuestMode && account?.yieldReferenceType)));
		setYieldFixedRate(String(account?.yieldFixedRate ?? ""));
		setYieldReferenceType(isGuestMode ? "" : (account?.yieldReferenceType ?? ""));
		setYieldReferencePercentage(String(account?.yieldReferencePercentage ?? 100));
		setYieldTaxIds(account?.yieldTaxIds ?? []);
		setYieldTaxRate(String(account?.yieldTaxRate ?? ""));
		setYieldPeriod(account?.yieldPeriod ?? "MONTHLY");
		setIsRecalculateCurrentDayYieldDialogOpen(false);
		setRewardsKind(account?.rewardsAccount?.kind ?? "POINTS");
		setInitialRewardsBalance(String(account?.rewardsAccount?.initialBalance ?? ""));
		setConversionEnabled(
			Boolean(account?.rewardsAccount?.conversionPoints && account.rewardsAccount.conversionAmount),
		);
		setConversionPoints(String(account?.rewardsAccount?.conversionPoints ?? ""));
		setConversionAmount(String(account?.rewardsAccount?.conversionAmount ?? ""));
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
		if (nextOpen) setCurrency(initialCurrency());
		setCountry(account?.countryCode ?? undefined);
		setInternalOpen(nextOpen);
		onOpenChange?.(nextOpen);
	};
	const yieldConfigurationChanged = () => {
		if (!account || type === "CREDIT_CARD") return false;
		return (
			(yieldEnabled && yieldFixedRate ? Number(yieldFixedRate) : null) !== (account.yieldFixedRate ?? null) ||
			(yieldEnabled && yieldFixedRate ? yieldPeriod : null) !== (account.yieldPeriod ?? null) ||
			(yieldEnabled && yieldReferenceType ? Number(yieldReferencePercentage) : null) !==
				(account.yieldReferencePercentage ?? null) ||
			(yieldEnabled && yieldReferenceType ? yieldReferenceType : null) !==
				(account.yieldReferenceType ?? null) ||
			(yieldEnabled && yieldTaxRate !== "" ? Number(yieldTaxRate) : null) !==
				(account.yieldTaxRate ?? null) ||
			JSON.stringify(yieldEnabled ? yieldTaxIds : []) !== JSON.stringify(account.yieldTaxIds ?? [])
		);
	};
	const save = async (recalculateCurrentDay: boolean) => {
		if (!institution || !countryCode || !currency) return;
		try {
			const data = {
				countryCode,
				creditCard:
					type === "CREDIT_CARD"
						? {
								creditLimit: Number(creditLimit),
								dueDay: Number(dueDay),
								excludeFromTotals,
								paymentAccountId,
								paymentSuggestionsEnabled,
								securityDeposit: securityDeposit ? Number(securityDeposit) : undefined,
								statementDay: Number(statementDay),
								workingDueDate: false,
							}
						: undefined,
				currency,
				institutionId,
				name: name.trim() || null,
				rewardsAccount:
					type === "REWARDS"
						? {
								conversionAmount:
									rewardsKind === "POINTS" && conversionEnabled
										? Number(conversionAmount)
										: account
											? null
											: undefined,
								conversionPoints:
									rewardsKind === "POINTS" && conversionEnabled
										? Number(conversionPoints)
										: account
											? null
											: undefined,
								initialBalance: Number(initialRewardsBalance || 0),
								kind: rewardsKind,
							}
						: undefined,
				type,
				...(account && { recalculateCurrentDay }),
				yieldFixedRate:
					type !== "CREDIT_CARD" && yieldEnabled && yieldFixedRate
						? Number(yieldFixedRate)
						: account
							? null
							: undefined,
				yieldPeriod:
					type !== "CREDIT_CARD" && yieldEnabled && yieldFixedRate ? yieldPeriod : account ? null : undefined,
				yieldReferencePercentage:
					type !== "CREDIT_CARD" && !isGuestMode && yieldEnabled && yieldReferenceType
						? Number(yieldReferencePercentage)
						: account
							? null
							: undefined,
				yieldReferenceType:
					type !== "CREDIT_CARD" && !isGuestMode && yieldEnabled && yieldReferenceType
						? yieldReferenceType
						: account
							? null
							: undefined,
				yieldTaxIds: type !== "CREDIT_CARD" && yieldEnabled ? yieldTaxIds : account ? null : undefined,
				yieldTaxRate:
					type !== "CREDIT_CARD" && yieldEnabled && yieldTaxRate !== ""
						? Number(yieldTaxRate)
						: account
							? null
							: undefined,
			};
			const operation =
				account && onUpdate
					? (() => {
							const { type: _, ...updateData } = data;
							return onUpdate(account.id, updateData);
						})()
					: onCreate(data as Draft);
			runDialogSave(operation, () => handleOpenChange(false), "Salvando conta…");
		} catch {
			return;
		}
	};
	const handleSubmit = (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		if (yieldConfigurationChanged()) {
			setIsRecalculateCurrentDayYieldDialogOpen(true);
			return;
		}
		void save(false);
	};

	return (
		<Dialog modal onOpenChange={handleOpenChange} open={open}>
			{showTrigger && (
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button
								aria-label={account ? `Editar ${account.name ?? "conta"}` : "Adicionar conta"}
								className={contextual ? "cursor-pointer" : "h-11 cursor-pointer"}
								size={iconOnly ? "icon-sm" : contextual ? "sm" : "default"}
								variant={contextual ? "outline" : "default"}
							>
								{account ? <LuPencil /> : <LuPlus />}
								{!iconOnly && ` ${account ? "Editar" : contextual ? "Adicionar conta" : "Nova conta"}`}
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					{iconOnly && <TooltipContent>{account ? "Editar conta" : "Adicionar conta"}</TooltipContent>}
				</Tooltip>
			)}
			<DialogContent className="sm:max-w-lg">
				<DialogHeader>
					<DialogTitle>
						{account
							? cardOnly
								? "Editar cartão"
								: "Editar conta"
							: cardOnly
								? "Cadastrar cartão"
								: "Cadastrar conta"}
					</DialogTitle>
					<DialogDescription>
						{account
							? "Atualize os dados desta conta."
							: cardOnly
								? "Configure os dados do cartão de crédito."
								: "Inclua conta bancária, dinheiro, investimento ou recompensas."}
					</DialogDescription>
				</DialogHeader>
				<form className="flex min-h-0 min-w-0 flex-1 flex-col gap-5" onSubmit={handleSubmit}>
					<DialogBody>
						<CustomSelect
							error={
								catalog.isError ? "Não foi possível carregar as instituições. Tente novamente." : undefined
							}
							isLoading={catalog.isPending}
							label="Instituição"
							onRetry={() => void catalog.refetch()}
							onValueChange={value => {
								setInstitutionId(value);
								setCountry(undefined);
								setCurrency("");
							}}
							options={[
								...institutions.map(institution => ({
									label: institution.name,
									value: institution.id,
								})),
							]}
							placeholder="Selecione uma instituição"
							required
							searchable
							value={institutionId}
						/>
						{institution && institutionId && <InstitutionAssociationProfile institutionId={institutionId} />}
						<CustomSelect
							disabled={!institution}
							label="País da conta"
							onValueChange={value => {
								setCountry(value);
								setCurrency("");
							}}
							options={availableCountries.map(value => ({ label: countryNames.of(value) ?? value, value }))}
							placeholder="Ex: Brasil"
							required
							searchable
							value={countryCode}
						/>
						<CurrencySelect
							currencies={availableCurrencies}
							disabled={!institution || !countryCode}
							label="Moeda da conta / cartão"
							onValueChange={setCurrency}
							value={currency}
						/>

						<FormField
							autoComplete="off"
							id="account-name"
							label="Nome da conta"
							name="account-name"
							onChange={event => setName(event.currentTarget.value)}
							placeholder={cardOnly ? "Ex: Cartão Gold" : "Ex: Conta principal"}
							type="text"
							value={name}
						/>
						{account ? (
							<div className="grid gap-2">
								<p className="font-medium text-sm">Tipo</p>
								<p className="rounded-md border bg-muted/30 px-3 py-2 text-sm">
									{types.find(item => item.value === type)?.label}
								</p>
							</div>
						) : (
							<CustomSelect
								label="Tipo"
								onValueChange={value => setType(value as FinancialAccount["type"])}
								options={
									cardOnly
										? types.filter(item => item.value === "CREDIT_CARD")
										: types.filter(item => item.value !== "CREDIT_CARD")
								}
								placeholder="Selecione o tipo"
								required
								value={type}
							/>
						)}
						{type !== "CREDIT_CARD" && (
							<AccountYieldFields
								allowReference={!isGuestMode}
								enabled={yieldEnabled}
								fixedRate={yieldFixedRate}
								onEnabledChange={setYieldEnabled}
								onFixedRateChange={setYieldFixedRate}
								onPeriodChange={setYieldPeriod}
								onReferencePercentageChange={setYieldReferencePercentage}
								onReferenceTypeChange={setYieldReferenceType}
								onTaxIdsChange={setYieldTaxIds}
								onTaxRateChange={setYieldTaxRate}
								period={yieldPeriod}
								referencePercentage={yieldReferencePercentage}
								referenceType={yieldReferenceType}
								taxIds={yieldTaxIds}
								taxRate={yieldTaxRate}
							/>
						)}
						{type === "REWARDS" && (
							<div className="grid gap-5 rounded-2xl border bg-muted/35 p-4">
								<CustomSelect
									label="Modalidade"
									onValueChange={value => {
										setRewardsKind(value as "CASHBACK" | "POINTS");
										if (value === "CASHBACK") setConversionEnabled(false);
									}}
									options={[
										{ label: "Pontos", value: "POINTS" },
										{ label: "Cashback em dinheiro", value: "CASHBACK" },
									]}
									placeholder="Selecione a modalidade"
									required
									value={rewardsKind}
								/>
								{rewardsKind === "CASHBACK" ? (
									<MoneyField
										currencyCode={currency}
										id="rewards-initial-balance"
										label="Saldo inicial"
										onValueChange={setInitialRewardsBalance}
										placeholder="R$ 150,00"
										value={initialRewardsBalance}
									/>
								) : (
									<NumericField
										decimalScale={4}
										id="rewards-initial-balance"
										label="Saldo inicial em pontos"
										onValueChange={setInitialRewardsBalance}
										placeholder="Ex: 10.000"
										value={initialRewardsBalance}
									/>
								)}
								{rewardsKind === "POINTS" && (
									<>
										<CheckboxField
											align="start"
											checkboxProps={{
												checked: conversionEnabled,
												id: "conversion-enabled",
												onCheckedChange: checked => setConversionEnabled(checked === true),
											}}
										>
											<span>
												<strong className="block">Informar equivalente monetário em {currency}</strong>
												<span className="text-muted-foreground">
													Saldo continua guardado e exibido em pontos.
												</span>
											</span>
										</CheckboxField>
										{conversionEnabled && (
											<div className="grid gap-4 sm:grid-cols-2">
												<NumericField
													decimalScale={4}
													id="conversion-points"
													label="Pontos"
													onValueChange={setConversionPoints}
													placeholder="Ex: 1.000"
													required
													value={conversionPoints}
												/>
												<MoneyField
													currencyCode={currency}
													id="conversion-amount"
													label="Equivalem a"
													onValueChange={setConversionAmount}
													required
													value={conversionAmount}
												/>
											</div>
										)}
									</>
								)}
							</div>
						)}
						{type === "CREDIT_CARD" && (
							<div className="grid gap-5 rounded-2xl border bg-muted/35 p-4">
								<MoneyField
									currencyCode={currency}
									id="credit-limit"
									label="Limite"
									onValueChange={setCreditLimit}
									placeholder="R$ 5.000,00"
									required
									value={creditLimit}
								/>
								<div className="grid gap-2">
									<MoneyField
										currencyCode={currency}
										id="security-deposit"
										label="Valor em garantia"
										onValueChange={setSecurityDeposit}
										placeholder="R$ 500,00"
										value={securityDeposit}
									/>
									<p className="text-muted-foreground text-xs">
										Use somente em cartões cujo limite depende de dinheiro deixado em garantia. Não entra no
										saldo disponível.
									</p>
								</div>
								<div className="grid gap-4 sm:grid-cols-2">
									<CustomSelect
										label="Fechamento"
										onValueChange={setStatementDay}
										options={days}
										placeholder="Dia da fatura"
										required
										sortOptions={false}
										value={statementDay}
									/>
									<CustomSelect
										label="Vencimento"
										onValueChange={setDueDay}
										options={days}
										placeholder="Dia do vencimento"
										required
										sortOptions={false}
										value={dueDay}
									/>
								</div>
								<p className="text-muted-foreground text-sm">
									Cashback e ajuste de vencimento seguem as regras da instituição e do perfil do vínculo,
									configuradas pelo admin.
								</p>
								<CheckboxField
									align="start"
									checkboxProps={{
										checked: excludeFromTotals,
										id: "exclude-from-totals",
										onCheckedChange: checked => setExcludeFromTotals(checked === true),
									}}
								>
									<span>
										<strong className="block">Não considerar nos totais</strong>
										<span className="text-muted-foreground">
											Use para cartão de outra pessoa: acompanhe compras e faturas sem somá-lo aos seus
											limites.
										</span>
									</span>
								</CheckboxField>
							</div>
						)}
						{type === "CREDIT_CARD" && (
							<CardPayerFields
								enabled={paymentSuggestionsEnabled}
								onEnabledChange={setPaymentSuggestionsEnabled}
								onPayerChange={setPaymentAccountId}
								payer={paymentAccountId}
							/>
						)}
					</DialogBody>
					<DialogFooter>
						<Button
							className="cursor-pointer"
							onClick={() => handleOpenChange(false)}
							type="button"
							variant="outline"
						>
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={
								pending ||
								!countryCode ||
								!currency ||
								!institution ||
								(type === "CREDIT_CARD" && !creditLimit) ||
								(type !== "CREDIT_CARD" && yieldEnabled && !yieldFixedRate && !yieldReferenceType) ||
								(type !== "CREDIT_CARD" && yieldEnabled && yieldReferenceType && !yieldReferencePercentage) ||
								(type === "REWARDS" && conversionEnabled && (!conversionPoints || !conversionAmount))
							}
							type="submit"
						>
							{pending ? "Salvando…" : "Salvar"}
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
			<RecalculateCurrentDayYieldDialog
				onOpenChange={setIsRecalculateCurrentDayYieldDialogOpen}
				onRecalculate={() => {
					setIsRecalculateCurrentDayYieldDialogOpen(false);
					void save(true);
				}}
				onSkip={() => {
					setIsRecalculateCurrentDayYieldDialogOpen(false);
					void save(false);
				}}
				open={isRecalculateCurrentDayYieldDialogOpen}
			/>
		</Dialog>
	);
}
