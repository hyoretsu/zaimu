import {
	LuArrowRight,
	LuCloudDownload,
	LuCreditCard,
	LuLandmark,
	LuReceiptText,
	LuRepeat2,
	LuStore,
	LuUsersRound,
	LuWalletCards,
} from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import type { FinancialAccount, Tag } from "@/lib/api";
import { formatLocalMonthYear } from "@/lib/date";
import { getTransactionAccountTypeLabel } from "@/lib/financial-account";

export interface TransactionBadgeAccount {
	id: string;
	name: string;
	rewardsKind?: "CASHBACK" | "POINTS";
	type?: FinancialAccount["type"];
}

export function TransactionBadges({
	accounts,
	creditCardPayment,
	debtPersonName,
	isFullySynced = false,
	isSynced = false,
	isSalary = false,
	isSubscription = false,
	storeName,
	tags,
}: {
	accounts: TransactionBadgeAccount[];
	creditCardPayment?: { cardName: string; statementDate?: string };
	debtPersonName?: string;
	isFullySynced?: boolean;
	isSynced?: boolean;
	isSalary?: boolean;
	isSubscription?: boolean;
	storeName?: string | null;
	tags?: Tag[];
}) {
	return (
		<ul aria-label="Detalhes da transação" className="flex min-w-0 list-none flex-wrap items-center gap-1.5">
			{accounts.map((account, index) => (
				<li className="flex min-w-0 items-center gap-1" key={account.id}>
					{index > 0 ? (
						<LuArrowRight aria-hidden="true" className="size-3 shrink-0 text-muted-foreground" />
					) : null}
					<AppBadge variant="outline">
						{account.type === "CREDIT_CARD" ? (
							<LuCreditCard aria-hidden="true" />
						) : (
							<LuLandmark aria-hidden="true" />
						)}
						<span className="min-w-0 truncate">
							<span className="text-muted-foreground">
								{getTransactionAccountTypeLabel(account.type, account.rewardsKind)}
							</span>{" "}
							{account.name}
						</span>
					</AppBadge>
				</li>
			))}
			{creditCardPayment ? (
				<>
					<li className="min-w-0">
						<AppBadge variant="outline">
							<LuCreditCard aria-hidden="true" />
							<span className="min-w-0 truncate">
								<span className="text-muted-foreground">Cartão</span> {creditCardPayment.cardName}
							</span>
						</AppBadge>
					</li>
					{creditCardPayment.statementDate ? (
						<li className="min-w-0">
							<AppBadge variant="outline">
								<LuReceiptText aria-hidden="true" />
								<span className="min-w-0 truncate">
									<span className="text-muted-foreground">Fatura</span>{" "}
									{formatLocalMonthYear(creditCardPayment.statementDate)}
								</span>
							</AppBadge>
						</li>
					) : null}
				</>
			) : null}
			{storeName ? (
				<li className="min-w-0">
					<AppBadge variant="outline">
						<LuStore aria-hidden="true" />
						<span className="min-w-0 truncate">
							<span className="text-muted-foreground">Loja</span> {storeName}
						</span>
					</AppBadge>
				</li>
			) : null}
			{debtPersonName ? (
				<li className="min-w-0">
					<AppBadge variant="outline">
						<LuUsersRound aria-hidden="true" />
						<span className="truncate">
							<span className="text-muted-foreground">Dívida</span> {debtPersonName}
						</span>
					</AppBadge>
				</li>
			) : null}
			{isSynced ? (
				<li>
					<AppBadge variant="outline">
						<LuCloudDownload aria-hidden="true" className="text-emerald-600" />
						<span>Sincronizada</span>
					</AppBadge>
				</li>
			) : null}
			{isFullySynced ? (
				<li>
					<AppBadge variant="outline">
						<LuCloudDownload aria-hidden="true" className="text-emerald-600" />
						<span>Parcelas sincronizadas</span>
					</AppBadge>
				</li>
			) : null}
			{isSubscription ? (
				<li>
					<AppBadge variant="outline">
						<LuRepeat2 aria-hidden="true" className="text-primary" />
						<span>Assinatura</span>
					</AppBadge>
				</li>
			) : null}
			{isSalary ? (
				<li>
					<AppBadge variant="outline">
						<LuWalletCards aria-hidden="true" className="text-emerald-600" />
						<span>Salário</span>
					</AppBadge>
				</li>
			) : null}
			{tags?.map(tag => (
				<li className="min-w-0" key={tag.id}>
					<AppBadge variant="outline">
						<span
							aria-hidden="true"
							className="size-2 shrink-0 rounded-full"
							style={{ backgroundColor: tag.color || "var(--primary)" }}
						/>
						<span className="truncate">{tag.name}</span>
					</AppBadge>
				</li>
			))}
		</ul>
	);
}
