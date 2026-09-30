import { type SyntheticEvent, useState } from "react";
import { LuPencil, LuPlus } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { CheckboxField } from "@/components/ui/CheckboxField";
import { CustomSelect } from "@/components/ui/CustomSelect";
import {
	Dialog,
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
import { ScrollArea } from "@/components/ui/ScrollArea";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { runDialogSave } from "@/lib/dialog-save";
import { useAuthStore } from "@/stores/auth";
import { AccountYieldFields } from "./AccountYieldFields";
import { CashbackSettingsDialog } from "./CashbackSettingsDialog";
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
const NEW_INSTITUTION = "__new_institution__";
const NO_INSTITUTION = "__no_institution__";
const AUTO_REWARDS_ACCOUNT = "__automatic_rewards_account__";

type Draft = Parameters<typeof import("@/lib/dataService").dataService.accounts.create>[0];
type UpdateDraft = import("@/lib/dataService").FinancialAccountUpdateDraft;

export function CreateFinancialAccountDialog({
	contextual = false,
	account,
	defaultType,
	cardOnly = false,
	defaultInstitutionId,
	institutions = [],
	rewardAccounts = [],
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
	const initialInstitution = () =>
		account?.institutionId ??
		defaultInstitutionId ??
		(defaultInstitutionId === null ? NO_INSTITUTION : undefined);
	const [internalOpen, setInternalOpen] = useState(false);
	const isGuestMode = useAuthStore(state => state.isGuestMode);
	const open = controlledOpen ?? internalOpen;
	const [institutionId, setInstitutionId] = useState<string | undefined>(initialInstitution);
	const [newInstitutionName, setNewInstitutionName] = useDebouncedInput("", () => undefined);
	const [name, setName] = useDebouncedInput(account?.name ?? "", () => undefined);
	const [type, setType] = useState<FinancialAccount["type"]>(account?.type ?? defaultType ?? "CHECKING");
	const [creditLimit, setCreditLimit] = useState(String(account?.creditCard?.creditLimit ?? ""));
	const [securityDeposit, setSecurityDeposit] = useState(String(account?.creditCard?.securityDeposit ?? ""));
	const [statementDay, setStatementDay] = useState(String(account?.creditCard?.statementDay ?? 10));
	const [dueDay, setDueDay] = useState(String(account?.creditCard?.dueDay ?? 17));
	const [workingDueDate, setWorkingDueDate] = useState(account?.creditCard?.workingDueDate ?? false);
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
	const [cashbackEnabled, setCashbackEnabled] = useState(Boolean(account?.creditCard?.cashbackRate));
	const [cashbackConfigOpen, setCashbackConfigOpen] = useState(false);
	const [cashbackRate, setCashbackRate] = useDebouncedInput(
		String(account?.creditCard?.cashbackRate ?? ""),
		() => undefined,
	);
	const [cashbackAccountId, setCashbackAccountId] = useState(
		account?.creditCard?.cashbackAccountId ?? AUTO_REWARDS_ACCOUNT,
	);
	const [cashbackKind, setCashbackKind] = useState<"CASHBACK" | "POINTS">("CASHBACK");
	const [cashbackPoints, setCashbackPoints] = useDebouncedInput("", () => undefined);
	const [cashbackSpendAmount, setCashbackSpendAmount] = useDebouncedInput("", () => undefined);
	const [cashbackConversionEnabled, setCashbackConversionEnabled] = useState(false);
	const [cashbackConversionPoints, setCashbackConversionPoints] = useDebouncedInput("", () => undefined);
	const [cashbackConversionAmount, setCashbackConversionAmount] = useDebouncedInput("", () => undefined);
	const [cashbackYieldEnabled, setCashbackYieldEnabled] = useState(
		Boolean(account?.creditCard?.cashbackYieldReferenceRate),
	);
	const [cashbackYieldReferenceRate, setCashbackYieldRate] = useDebouncedInput(
		String(account?.creditCard?.cashbackYieldReferenceRate ?? ""),
		() => undefined,
	);
	const [cashbackYieldReferencePercentage, setCashbackYieldReferencePercentage] = useDebouncedInput(
		String(account?.creditCard?.cashbackYieldReferencePercentage ?? 100),
		() => undefined,
	);
	const [cashbackYieldPeriod, setCashbackYieldPeriod] = useState<"MONTHLY" | "YEARLY">(
		account?.creditCard?.cashbackYieldPeriod ?? "MONTHLY",
	);
	const hasInvalidBillingDays = Number(statementDay) >= Number(dueDay);

	const reset = () => {
		setInstitutionId(initialInstitution());
		setNewInstitutionName("");
		setName(account?.name ?? "");
		setType(account?.type ?? defaultType ?? "CHECKING");
		setCreditLimit(String(account?.creditCard?.creditLimit ?? ""));
		setSecurityDeposit(String(account?.creditCard?.securityDeposit ?? ""));
		setStatementDay(String(account?.creditCard?.statementDay ?? 10));
		setDueDay(String(account?.creditCard?.dueDay ?? 17));
		setWorkingDueDate(account?.creditCard?.workingDueDate ?? false);
		setExcludeFromTotals(account?.creditCard?.excludeFromTotals ?? false);
		setYieldEnabled(Boolean(account?.yieldFixedRate || (!isGuestMode && account?.yieldReferenceType)));
		setYieldFixedRate(String(account?.yieldFixedRate ?? ""));
		setYieldReferenceType(isGuestMode ? "" : (account?.yieldReferenceType ?? ""));
		setYieldReferencePercentage(String(account?.yieldReferencePercentage ?? 100));
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
		setCashbackEnabled(Boolean(account?.creditCard?.cashbackRate));
		setCashbackConfigOpen(false);
		setCashbackRate(String(account?.creditCard?.cashbackRate ?? ""));
		setCashbackAccountId(account?.creditCard?.cashbackAccountId ?? AUTO_REWARDS_ACCOUNT);
		setCashbackKind("CASHBACK");
		setCashbackPoints("");
		setCashbackSpendAmount("");
		setCashbackConversionEnabled(false);
		setCashbackConversionPoints("");
		setCashbackConversionAmount("");
		setCashbackYieldEnabled(Boolean(account?.creditCard?.cashbackYieldReferenceRate));
		setCashbackYieldRate(String(account?.creditCard?.cashbackYieldReferenceRate ?? ""));
		setCashbackYieldReferencePercentage(String(account?.creditCard?.cashbackYieldReferencePercentage ?? 100));
		setCashbackYieldPeriod(account?.creditCard?.cashbackYieldPeriod ?? "MONTHLY");
	};
	useDialogCloseReset(open, reset);
	const handleOpenChange = (nextOpen: boolean) => {
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
			(yieldEnabled && yieldTaxRate !== "" ? Number(yieldTaxRate) : null) !== (account.yieldTaxRate ?? null)
		);
	};
	const save = async (recalculateCurrentDay: boolean) => {
		try {
			const institutionName =
				institutionId === NEW_INSTITUTION
					? newInstitutionName.trim()
					: institutions.find(institution => institution.id === institutionId)?.name;
			const data = {
				creditCard:
					type === "CREDIT_CARD"
						? {
								...(cashbackEnabled
									? {
											...(cashbackAccountId !== AUTO_REWARDS_ACCOUNT && { cashbackAccountId }),
											cashbackRate:
												cashbackKind === "CASHBACK"
													? Number(cashbackRate)
													: Number(cashbackPoints) / Number(cashbackSpendAmount),
											cashbackRewards: {
												conversionAmount:
													cashbackKind === "POINTS" && cashbackConversionEnabled
														? Number(cashbackConversionAmount)
														: undefined,
												conversionPoints:
													cashbackKind === "POINTS" && cashbackConversionEnabled
														? Number(cashbackConversionPoints)
														: undefined,
												kind: cashbackKind,
											},
											cashbackYieldPeriod: cashbackYieldEnabled ? cashbackYieldPeriod : null,
											cashbackYieldReferencePercentage: cashbackYieldEnabled
												? Number(cashbackYieldReferencePercentage)
												: null,
											cashbackYieldReferenceRate: cashbackYieldEnabled
												? Number(cashbackYieldReferenceRate)
												: null,
										}
									: account
										? {
												cashbackAccountId: null,
												cashbackRate: null,
												cashbackRewards: undefined,
												cashbackYieldPeriod: null,
												cashbackYieldReferencePercentage: null,
												cashbackYieldReferenceRate: null,
											}
										: {}),
								creditLimit: Number(creditLimit),
								dueDay: Number(dueDay),
								excludeFromTotals,
								securityDeposit: securityDeposit ? Number(securityDeposit) : undefined,
								statementDay: Number(statementDay),
								workingDueDate,
							}
						: undefined,
				institutionName: institutionId === NO_INSTITUTION ? "" : institutionName || undefined,
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
		if (type === "CREDIT_CARD" && hasInvalidBillingDays) return;
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
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-6 p-6">
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
						<form className="grid gap-5" onSubmit={handleSubmit}>
							<CustomSelect
								label="Instituição"
								onValueChange={setInstitutionId}
								options={[
									{ label: "Nova instituição", special: true, value: NEW_INSTITUTION },
									{ label: "Sem instituição", special: true, value: NO_INSTITUTION },
									...institutions.map(institution => ({
										label: institution.name,
										value: institution.id,
									})),
								]}
								placeholder="Selecione uma instituição"
								searchable
								sortOptions={false}
								value={institutionId}
							/>
							{institutionId === NEW_INSTITUTION && (
								<FormField
									autoComplete="organization"
									description="Banco, fintech ou corretora que reúne esta conta."
									id="institution-name"
									label="Nome da instituição"
									name="institution-name"
									onChange={event => setNewInstitutionName(event.currentTarget.value)}
									placeholder="Ex: Mercado Pago"
									required
									type="text"
									value={newInstitutionName}
								/>
							)}
							<FormField
								autoComplete="off"
								id="account-name"
								label="Nome da conta (opcional)"
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
									onTaxRateChange={setYieldTaxRate}
									period={yieldPeriod}
									referencePercentage={yieldReferencePercentage}
									referenceType={yieldReferenceType}
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
											id="rewards-initial-balance"
											label="Saldo inicial (opcional)"
											onValueChange={setInitialRewardsBalance}
											placeholder="R$ 150,00"
											value={initialRewardsBalance}
										/>
									) : (
										<NumericField
											decimalScale={4}
											id="rewards-initial-balance"
											label="Saldo inicial em pontos (opcional)"
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
													<strong className="block">Informar conversão para reais</strong>
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
														id="conversion-amount"
														label="Equivalem a"
														onValueChange={setConversionAmount}
														placeholder="R$ 10,00"
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
										id="credit-limit"
										label="Limite"
										onValueChange={setCreditLimit}
										placeholder="R$ 5.000,00"
										required
										value={creditLimit}
									/>
									<div className="grid gap-2">
										<MoneyField
											id="security-deposit"
											label="Valor em garantia (opcional)"
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
									{hasInvalidBillingDays && (
										<p className="text-destructive text-sm">
											O vencimento deve ser posterior ao fechamento da fatura.
										</p>
									)}
									<CheckboxField
										align="start"
										checkboxProps={{
											checked: cashbackEnabled,
											id: "cashback-enabled",
											onCheckedChange: checked => {
												setCashbackEnabled(checked === true);
												if (checked === true) setCashbackConfigOpen(true);
												if (checked !== true) setCashbackYieldEnabled(false);
											},
										}}
									>
										<span>
											<strong className="block">Este cartão oferece cashback</strong>
											<span className="text-muted-foreground">
												Cada compra credita a recompensa automaticamente.
											</span>
										</span>
									</CheckboxField>
									{cashbackEnabled && (
										<Button
											className="cursor-pointer"
											onClick={() => setCashbackConfigOpen(true)}
											type="button"
											variant="outline"
										>
											Configurar cashback
										</Button>
									)}
									{/* Cashback fields render in their own dialog to preserve this form's geometry.
									{cashbackEnabled && (
										<div className="hidden">
											<CustomSelect
												label="Recompensa recebida"
												onValueChange={value => setCashbackKind(value as "CASHBACK" | "POINTS")}
												options={[
													{ label: "Cashback em dinheiro", value: "CASHBACK" },
													{ label: "Pontos", value: "POINTS" },
												]}
												placeholder="Selecione a recompensa"
												value={cashbackKind}
											/>
											{cashbackKind === "CASHBACK" ? (
												<NumericField
													decimalScale={4}
													id="cashback-rate"
													label="Cashback"
													onValueChange={setCashbackRate}
													placeholder="Ex: 1,5%"
													required
													suffix="%"
													value={cashbackRate}
												/>
											) : (
												<div className="grid gap-4 sm:grid-cols-2">
													<NumericField
														decimalScale={4}
														id="cashback-points"
														label="Pontos ganhos"
														onValueChange={setCashbackPoints}
														placeholder="Ex: 2"
														required
														value={cashbackPoints}
													/>
													<MoneyField
														id="cashback-spend-amount"
														label="A cada"
														onValueChange={setCashbackSpendAmount}
														placeholder="R$ 1,00"
														required
														value={cashbackSpendAmount}
													/>
												</div>
											)}
											<CustomSelect
												label="Conta de destino"
												searchable
												onValueChange={setCashbackAccountId}
												options={[
													{ label: "Criar ou reutilizar automaticamente", special: true, value: AUTO_REWARDS_ACCOUNT },
													...rewardAccounts.map(rewardAccount => ({
														label: getFinancialAccountOptionLabel(rewardAccount),
														value: rewardAccount.id,
													})),
												]}
												placeholder="Selecione a conta de recompensa"
												value={cashbackAccountId}
											/>
											<p className="text-muted-foreground text-xs">
												Sem escolha, uma conta sem nome será criada ou reutilizada nesta instituição.
											</p>
											{cashbackKind === "POINTS" && (
												<>
													<CheckboxField
														align="start"
														checkboxProps={{
															checked: cashbackConversionEnabled,
															id: "cashback-conversion-enabled",
															onCheckedChange: checked => setCashbackConversionEnabled(checked === true),
														}}
													>
														<span>
															<strong className="block">Informar conversão para reais</strong>
															<span className="text-muted-foreground">
																Opcional. Pontos continuam guardados em pontos.
															</span>
														</span>
													</CheckboxField>
													{cashbackConversionEnabled && (
														<div className="grid gap-4 sm:grid-cols-2">
															<NumericField
																decimalScale={4}
																id="cashback-conversion-points"
																label="Pontos"
																onValueChange={setCashbackConversionPoints}
																placeholder="Ex: 1.000"
																required
																value={cashbackConversionPoints}
															/>
															<MoneyField
																id="cashback-conversion-amount"
																label="Equivalem a"
																onValueChange={setCashbackConversionAmount}
																placeholder="R$ 10,00"
																required
																value={cashbackConversionAmount}
															/>
														</div>
													)}
												</>
											)}
											<CheckboxField
												align="start"
												checkboxProps={{
													checked: cashbackYieldEnabled,
													id: "cashback-yield-enabled",
													onCheckedChange: checked => setCashbackYieldEnabled(checked === true),
												}}
											>
												<span>
													<strong className="block">Cashback rende ao longo do tempo</strong>
													<span className="text-muted-foreground">Rendimento composto mensal ou anual.</span>
												</span>
											</CheckboxField>
											{cashbackYieldEnabled && (
												<div className="grid gap-4 sm:grid-cols-2">
													<NumericField
														decimalScale={4}
														id="cashback-yield-rate"
														label="Rendimento"
														onValueChange={setCashbackYieldRate}
														placeholder="Ex: 0,5%"
														required
														suffix="%"
														value={cashbackYieldReferenceRate}
													/>
													<CustomSelect
														label="Período"
														onValueChange={value => setCashbackYieldPeriod(value as "MONTHLY" | "YEARLY")}
														options={[
															{ label: "Ao mês", value: "MONTHLY" },
															{ label: "Ao ano", value: "YEARLY" },
														]}
														placeholder="Selecione o período"
														required
														value={cashbackYieldPeriod}
													/>
												</div>
											)}
										</div>
									)} */}
									<CheckboxField
										align="start"
										checkboxProps={{
											checked: workingDueDate,
											id: "working-due-date",
											onCheckedChange: checked => setWorkingDueDate(checked === true),
										}}
									>
										<span>
											<strong className="block">Ajustar para dia útil</strong>
											<span className="text-muted-foreground">
												Move vencimentos que caem em fim de semana.
											</span>
										</span>
									</CheckboxField>
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
										(institutionId === NEW_INSTITUTION && !newInstitutionName.trim()) ||
										(type === "CREDIT_CARD" && !creditLimit) ||
										(type === "CREDIT_CARD" && hasInvalidBillingDays) ||
										(type === "CREDIT_CARD" &&
											cashbackEnabled &&
											cashbackKind === "CASHBACK" &&
											!cashbackRate) ||
										(type === "CREDIT_CARD" &&
											cashbackEnabled &&
											cashbackKind === "POINTS" &&
											(!cashbackPoints || !cashbackSpendAmount)) ||
										(type === "CREDIT_CARD" && cashbackYieldEnabled && !cashbackYieldReferenceRate) ||
										(type === "CREDIT_CARD" && cashbackYieldEnabled && !cashbackYieldReferencePercentage) ||
										(type !== "CREDIT_CARD" && yieldEnabled && !yieldFixedRate && !yieldReferenceType) ||
										(type !== "CREDIT_CARD" &&
											yieldEnabled &&
											yieldReferenceType &&
											!yieldReferencePercentage) ||
										(type === "CREDIT_CARD" &&
											cashbackEnabled &&
											cashbackKind === "POINTS" &&
											cashbackConversionEnabled &&
											(!cashbackConversionPoints || !cashbackConversionAmount)) ||
										(type === "REWARDS" && conversionEnabled && (!conversionPoints || !conversionAmount))
									}
									type="submit"
								>
									{pending ? "Salvando…" : "Salvar"}
								</Button>
							</DialogFooter>
						</form>
					</div>
				</ScrollArea>
			</DialogContent>
			<CashbackSettingsDialog
				automaticAccountValue={AUTO_REWARDS_ACCOUNT}
				cashbackAccountId={cashbackAccountId}
				cashbackConversionAmount={cashbackConversionAmount}
				cashbackConversionEnabled={cashbackConversionEnabled}
				cashbackConversionPoints={cashbackConversionPoints}
				cashbackKind={cashbackKind}
				cashbackPoints={cashbackPoints}
				cashbackRate={cashbackRate}
				cashbackSpendAmount={cashbackSpendAmount}
				cashbackYieldEnabled={cashbackYieldEnabled}
				cashbackYieldPeriod={cashbackYieldPeriod}
				cashbackYieldReferencePercentage={cashbackYieldReferencePercentage}
				cashbackYieldReferenceRate={cashbackYieldReferenceRate}
				onOpenChange={setCashbackConfigOpen}
				open={cashbackConfigOpen}
				rewardAccounts={rewardAccounts}
				setCashbackAccountId={setCashbackAccountId}
				setCashbackConversionAmount={setCashbackConversionAmount}
				setCashbackConversionEnabled={setCashbackConversionEnabled}
				setCashbackConversionPoints={setCashbackConversionPoints}
				setCashbackKind={setCashbackKind}
				setCashbackPoints={setCashbackPoints}
				setCashbackRate={setCashbackRate}
				setCashbackSpendAmount={setCashbackSpendAmount}
				setCashbackYieldEnabled={setCashbackYieldEnabled}
				setCashbackYieldPeriod={setCashbackYieldPeriod}
				setCashbackYieldRate={setCashbackYieldRate}
				setCashbackYieldReferencePercentage={setCashbackYieldReferencePercentage}
			/>
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
