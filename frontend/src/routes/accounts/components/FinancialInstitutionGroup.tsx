import { LuLandmark, LuWalletCards } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { AppBadge } from "@/components/ui/AppBadge";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { getFinancialAccountCurrencyValue } from "@/lib/financial-account";
import { CreateFinancialAccountDialog } from "./CreateFinancialAccountDialog";
import { FinancialAccountCard } from "./FinancialAccountCard";
import { InstitutionActions } from "./InstitutionActions";

export function FinancialInstitutionGroup({
	accounts,
	institution,
	institutions,
	onCreate,
	onDelete,
	onHide,
	onUpdate,
	onDeleteInstitution,
	pending,
	rewardAccounts,
}: {
	accounts: FinancialAccount[];
	institution: FinancialInstitution | null;
	institutions: FinancialInstitution[];
	onCreate: Parameters<typeof CreateFinancialAccountDialog>[0]["onCreate"];
	onDelete: (account: FinancialAccount) => void | Promise<void>;
	onHide: (account: FinancialAccount) => void;
	onUpdate: NonNullable<Parameters<typeof CreateFinancialAccountDialog>[0]["onUpdate"]>;

	onDeleteInstitution: (institution: FinancialInstitution) => Promise<unknown>;
	pending: boolean;
	rewardAccounts: FinancialAccount[];
}) {
	const balances = new Map<string, number>();
	for (const account of accounts.filter(account => account.type !== "CREDIT_CARD")) {
		const denomination = account.rewardsAccount?.conversionCurrency ?? account.currency ?? "BRL";
		balances.set(
			denomination,
			(balances.get(denomination) ?? 0) + getFinancialAccountCurrencyValue(account),
		);
	}
	const Icon = institution ? LuLandmark : LuWalletCards;

	return (
		<section className="bg-card/35 shadow-card grid max-w-full min-w-0 gap-4 overflow-x-clip rounded-3xl border p-4 sm:p-5">
			<header className="border-border/70 grid min-w-0 gap-4 border-b pb-4 sm:flex sm:flex-wrap sm:items-center sm:justify-between">
				<div className="flex min-w-0 items-center gap-3">
					<span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
						<Icon className="size-5" />
					</span>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="truncate text-lg font-bold">
								{institution?.name ?? "Sem instituição"}
							</h2>
							<AppBadge variant="secondary">
								{accounts.length} {accounts.length === 1 ? "produto" : "produtos"}
							</AppBadge>
						</div>
						<p className="text-muted-foreground mt-0.5 text-sm">
							Saldos:{" "}
							<strong className="text-foreground">
								<PreferredMoneyAmount
									values={[...balances].map(([currency, amount]) => ({ amount, currency }))}
								/>
							</strong>
						</p>
					</div>
				</div>
				<ActionGroup className="sm:ml-auto">
					{institution && (
						<InstitutionActions institution={institution} onDelete={onDeleteInstitution} />
					)}
					<CreateFinancialAccountDialog
						contextual
						defaultInstitutionId={institution?.id ?? null}
						iconOnly
						institutions={institutions}
						onCreate={onCreate}
						pending={pending}
						rewardAccounts={rewardAccounts}
					/>
				</ActionGroup>
			</header>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{accounts.map(account => (
					<FinancialAccountCard
						account={account}
						institutions={institutions}
						key={account.id}
						onDelete={() => onDelete(account)}
						onHide={() => onHide(account)}
						onUpdate={onUpdate}
						rewardAccounts={rewardAccounts}
					/>
				))}
			</div>
		</section>
	);
}
