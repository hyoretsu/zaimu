import type { Dispatch, SetStateAction } from "react";
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
} from "@/components/ui/Dialog";
import { MoneyField } from "@/components/ui/MoneyField";
import { NumericField } from "@/components/ui/NumericField";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { FinancialAccount } from "@/lib/api";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";

type SetString = (value: string) => void;

export function CashbackSettingsDialog({
	automaticAccountValue,
	cashbackAccountId,
	cashbackConversionAmount,
	cashbackConversionEnabled,
	cashbackConversionPoints,
	cashbackKind,
	cashbackPoints,
	cashbackRate,
	cashbackSpendAmount,
	cashbackYieldEnabled,
	cashbackYieldPeriod,
	cashbackYieldReferencePercentage,
	cashbackYieldReferenceRate,
	onOpenChange,
	open,
	rewardAccounts,
	setCashbackAccountId,
	setCashbackConversionAmount,
	setCashbackConversionEnabled,
	setCashbackConversionPoints,
	setCashbackKind,
	setCashbackPoints,
	setCashbackRate,
	setCashbackSpendAmount,
	setCashbackYieldEnabled,
	setCashbackYieldPeriod,
	setCashbackYieldReferencePercentage,
	setCashbackYieldRate,
}: {
	automaticAccountValue: string;
	cashbackAccountId: string;
	cashbackConversionAmount: string;
	cashbackConversionEnabled: boolean;
	cashbackConversionPoints: string;
	cashbackKind: "CASHBACK" | "POINTS";
	cashbackPoints: string;
	cashbackRate: string;
	cashbackSpendAmount: string;
	cashbackYieldEnabled: boolean;
	cashbackYieldPeriod: "MONTHLY" | "YEARLY";
	cashbackYieldReferencePercentage: string;
	cashbackYieldReferenceRate: string;
	onOpenChange: (open: boolean) => void;
	open: boolean;
	rewardAccounts: FinancialAccount[];
	setCashbackAccountId: SetString;
	setCashbackConversionAmount: SetString;
	setCashbackConversionEnabled: Dispatch<SetStateAction<boolean>>;
	setCashbackConversionPoints: SetString;
	setCashbackKind: Dispatch<SetStateAction<"CASHBACK" | "POINTS">>;
	setCashbackPoints: SetString;
	setCashbackRate: SetString;
	setCashbackSpendAmount: SetString;
	setCashbackYieldEnabled: Dispatch<SetStateAction<boolean>>;
	setCashbackYieldPeriod: Dispatch<SetStateAction<"MONTHLY" | "YEARLY">>;
	setCashbackYieldReferencePercentage: SetString;
	setCashbackYieldRate: SetString;
}) {
	return (
		<Dialog onOpenChange={onOpenChange} open={open}>
			<DialogContent className="max-h-[92dvh] overflow-hidden p-0 sm:max-w-lg">
				<ScrollArea className="max-h-[92dvh]">
					<div className="grid gap-6 p-6">
						<DialogHeader>
							<DialogTitle>Cashback</DialogTitle>
							<DialogDescription>Configure a recompensa recebida em cada compra.</DialogDescription>
						</DialogHeader>
						<div className="grid gap-4">
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
								onValueChange={setCashbackAccountId}
								options={[
									{
										label: "Criar ou reutilizar automaticamente",
										special: true,
										value: automaticAccountValue,
									},
									...rewardAccounts.map(account => ({
										label: getFinancialAccountOptionLabel(account),
										value: account.id,
									})),
								]}
								placeholder="Selecione a conta de recompensa"
								searchable
								value={cashbackAccountId}
							/>
							{cashbackAccountId === automaticAccountValue && (
								<p className="text-muted-foreground text-xs">
									Uma conta sem nome será criada ou reutilizada nesta instituição.
								</p>
							)}
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
								<div className="grid gap-4 sm:grid-cols-3">
									<NumericField
										decimalScale={4}
										id="cashback-yield-rate"
										label="Taxa de referência"
										onValueChange={setCashbackYieldRate}
										placeholder="Ex: 13,9%"
										required
										suffix="%"
										value={cashbackYieldReferenceRate}
									/>
									<NumericField
										decimalScale={4}
										id="cashback-yield-reference-percentage"
										label="Percentual da referência"
										onValueChange={setCashbackYieldReferencePercentage}
										placeholder="Ex: 100%"
										required
										suffix="%"
										value={cashbackYieldReferencePercentage}
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
						<DialogFooter>
							<Button className="cursor-pointer" onClick={() => onOpenChange(false)} type="button">
								Concluir
							</Button>
						</DialogFooter>
					</div>
				</ScrollArea>
			</DialogContent>
		</Dialog>
	);
}
