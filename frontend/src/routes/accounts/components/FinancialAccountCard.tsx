import { useState } from "react";
import {
	LuBanknote,
	LuCreditCard,
	LuEllipsis,
	LuEyeOff,
	LuFileUp,
	LuLandmark,
	LuPiggyBank,
	LuReceiptText,
	LuSparkles,
	LuTrash2,
	LuWallet,
} from "react-icons/lu";
import { AccountTransferDialog } from "@/components/account-transfers";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ImportTransactionsDialog, TransactionImportReviewDialog } from "@/components/transaction-imports";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import { Popover, PopoverContent, PopoverTrigger } from "@/components/ui/Popover";
import { useUrlModalSelection } from "@/hooks/use-url-modal-selection";
import { primaryCurrency } from "@/lib/account-assets";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import {
	getFinancialAccountCurrencyValue,
	getFinancialAccountDisplayName,
	getFinancialAccountTitle,
	getFinancialAccountTypeLabel,
} from "@/lib/financial-account";
import { AccountAssetBreakdown } from "./AccountAssetBreakdown";
import { CreateFinancialAccountDialog } from "./CreateFinancialAccountDialog";
import { CreditCardAccountSummary } from "./CreditCardAccountSummary";
import { FinancialAccountStatementDialog } from "./FinancialAccountStatementDialog";
import { RecalculateAccountYieldButton } from "./RecalculateAccountYieldButton";

const accountType = {
	CASH: { icon: LuBanknote },
	CHECKING: { icon: LuLandmark },
	CREDIT_CARD: { icon: LuCreditCard },
	INVESTMENT: { icon: LuWallet },
	REWARDS: { icon: LuSparkles },
	SAVINGS: { icon: LuPiggyBank },
} as const;

const points = new Intl.NumberFormat("pt-BR", { maximumFractionDigits: 4 });

export function FinancialAccountCard({
	account,
	institutions,
	onDelete,
	onHide,
	onUpdate,
	rewardAccounts,
}: {
	account: FinancialAccount;
	institutions: FinancialInstitution[];
	onDelete: () => void | Promise<void>;
	onHide: () => void;
	onUpdate: Parameters<typeof CreateFinancialAccountDialog>[0]["onUpdate"];
	rewardAccounts: FinancialAccount[];
}) {
	const [statementAccountId, setStatementAccountId] = useUrlModalSelection("statementAccountId", [
		`account.${account.id}.transactions.groups`,
	]);
	const statementOpen = statementAccountId === account.id && account.type !== "CREDIT_CARD";
	const setStatementOpen = (open: boolean) => setStatementAccountId(open ? account.id : null);
	const [importOpen, setImportOpen] = useState(false);
	const [reviewingImportId, setReviewingImportId] = useState<string | null>(null);
	const config = accountType[account.type];
	const Icon = config.icon;
	const displayName = getFinancialAccountDisplayName(account);
	const typeLabel = getFinancialAccountTypeLabel(account.type);
	const listName = getFinancialAccountTitle(account);
	const accountHasCustomTitle = Boolean(account.name?.trim() && listName !== typeLabel);
	return (
		<article className="group bg-card shadow-card hover:border-primary/30 row-span-3 grid grid-rows-subgrid gap-y-0 rounded-2xl border p-5 transition hover:-translate-y-0.5">
			<div className="flex min-h-16 flex-col gap-3 sm:flex-row sm:items-start sm:justify-between sm:gap-4">
				<div className="flex min-w-0 flex-1 items-start gap-3">
					<span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
						<Icon className="size-5" />
					</span>
					<div className="min-w-0">
						<h2 className="text-base leading-snug font-bold break-words">{listName}</h2>
						{accountHasCustomTitle && (
							<AppBadge className="mt-1 flex" variant="secondary">
								{typeLabel}
							</AppBadge>
						)}
					</div>
				</div>
				<div className="flex shrink-0 items-center gap-2 self-end sm:self-start">
					<AccountTransferDialog accountId={account.id} iconOnly />
					<CreateFinancialAccountDialog
						account={account}
						contextual
						iconOnly
						institutions={institutions}
						onCreate={async () => undefined}
						onUpdate={onUpdate}
						pending={false}
						rewardAccounts={rewardAccounts}
					/>
					<Popover>
						<PopoverTrigger asChild>
							<Button
								aria-label={`Mais ações de ${displayName}`}
								className="cursor-pointer"
								size="icon-sm"
								variant="outline"
							>
								<LuEllipsis />
							</Button>
						</PopoverTrigger>
						<PopoverContent align="end" className="flex w-48 flex-col gap-2 p-2">
							<Button
								className="w-full cursor-pointer justify-start"
								onClick={onHide}
								size="sm"
								variant="outline"
							>
								<LuEyeOff /> Esconder conta
							</Button>
							<ConfirmActionButton
								className="w-full cursor-pointer justify-start"
								confirmation={`Excluir ${displayName} permanentemente?`}
								onConfirm={onDelete}
								size="sm"
								variant="destructive"
							>
								<LuTrash2 /> Excluir conta
							</ConfirmActionButton>
						</PopoverContent>
					</Popover>
				</div>
			</div>
			<div className="border-border/70 mt-6 border-t pt-4">
				{account.type === "CREDIT_CARD" ? (
					<CreditCardAccountSummary accountId={account.id} />
				) : account.type === "REWARDS" && account.rewardsAccount?.kind === "POINTS" ? (
					<>
						<p className="text-muted-foreground text-xs">Pontos acumulados</p>
						<p className="mt-1 text-2xl font-bold">
							{points.format(account.pointsBalance ?? 0)} pontos
						</p>
						{account.rewardsAccount.conversionPoints ? (
							<p className="text-muted-foreground mt-1 text-sm">
								Equivalente a{" "}
								<PreferredMoneyAmount
									values={[
										{
											amount: getFinancialAccountCurrencyValue(account),
											currency:
												account.rewardsAccount.conversionCurrency ??
												primaryCurrency(account) ??
												"BRL",
										},
									]}
								/>
							</p>
						) : null}
					</>
				) : (
					<>
						<p className="text-muted-foreground text-xs">
							{account.type === "REWARDS" ? "Cashback disponível" : "Saldo disponível"}
						</p>
						<p className="mt-1 text-2xl font-bold">
							<PreferredMoneyAmount
								highlightNegative
								values={account.assets.map(asset => ({
									amount: asset.balance,
									currency: asset.assetCode,
								}))}
							/>
						</p>
						<AccountAssetBreakdown assets={account.assets} />
						{account.netBalance != null && (
							<p className="text-muted-foreground mt-1 text-sm">
								Saldo líquido:{" "}
								<PreferredMoneyAmount
									values={[
										{
											amount: account.netBalance,
											currency: primaryCurrency(account) ?? "BRL",
										},
									]}
								/>
							</p>
						)}
					</>
				)}
			</div>
			<div>
				{account.type !== "CREDIT_CARD" &&
				(account.type !== "REWARDS" || account.rewardsAccount?.kind === "CASHBACK") ? (
					<Button
						className="mt-4 w-full cursor-pointer"
						onClick={() => setStatementOpen(true)}
						size="sm"
						variant="outline"
					>
						<LuReceiptText /> Extrato
					</Button>
				) : null}
				{account.type !== "CREDIT_CARD" && account.type !== "REWARDS" ? (
					<>
						<Button
							className="mt-2 w-full cursor-pointer"
							onClick={() => setImportOpen(true)}
							size="sm"
							variant="outline"
						>
							<LuFileUp /> Importar extrato
						</Button>
						<ImportTransactionsDialog
							defaultFinancialAccountId={account.id}
							onImported={setReviewingImportId}
							onOpenChange={setImportOpen}
							open={importOpen}
						/>
						<TransactionImportReviewDialog
							importId={reviewingImportId}
							onOpenChange={nextOpen => !nextOpen && setReviewingImportId(null)}
							open={reviewingImportId !== null}
						/>
					</>
				) : null}
				{account.type !== "CREDIT_CARD" && <RecalculateAccountYieldButton account={account} />}
				{account.type !== "CREDIT_CARD" && (
					<FinancialAccountStatementDialog
						account={account}
						onOpenChange={setStatementOpen}
						open={statementOpen}
					/>
				)}
			</div>
		</article>
	);
}
