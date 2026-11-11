import { LuLandmark, LuList, LuWalletCards } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useUrlModalSelection } from "@/hooks/use-url-modal-selection";
import type { FinancialAccount, FinancialInstitution } from "@/lib/api";
import { getFinancialAccountMoneyPositions } from "@/lib/financial-account";
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
	const [openInstitutionId, setOpenInstitutionId] = useUrlModalSelection("institutionId");
	const groupId = institution?.id ?? "unassigned";
	const listOpen = openInstitutionId === groupId;
	const balances = accounts.flatMap(getFinancialAccountMoneyPositions);
	const Icon = institution ? LuLandmark : LuWalletCards;
	const title = institution?.name ?? "Sem instituição";

	return (
		<article className="bg-card shadow-card hover:border-primary/30 flex min-w-0 flex-col gap-4 rounded-2xl border p-5 transition hover:-translate-y-0.5">
			<div className="flex min-w-0 items-start justify-between gap-3">
				<div className="flex min-w-0 items-center gap-3">
					<span className="bg-primary/10 text-primary flex size-11 shrink-0 items-center justify-center rounded-2xl">
						<Icon className="size-5" />
					</span>
					<div className="min-w-0">
						<h2 className="truncate text-lg font-bold">{title}</h2>
						<AppBadge className="mt-1" variant="secondary">
							{accounts.length} {accounts.length === 1 ? "conta" : "contas"}
						</AppBadge>
					</div>
				</div>
				<ActionGroup className="shrink-0 justify-end">
					{institution && (
						<InstitutionActions institution={institution} onDelete={onDeleteInstitution} />
					)}
				</ActionGroup>
			</div>
			<div className="border-border/70 border-t pt-4">
				<p className="text-muted-foreground text-xs">Saldos</p>
				<p className="mt-1 text-2xl font-bold">
					<PreferredMoneyAmount values={balances} />
				</p>
			</div>
			<div className="grid gap-2 [&>button]:w-full">
				<CreateFinancialAccountDialog
					contextual
					defaultInstitutionId={institution?.id ?? null}
					institutions={institutions}
					onCreate={onCreate}
					pending={pending}
					rewardAccounts={rewardAccounts}
				/>
				<Button
					className="w-full cursor-pointer"
					onClick={() => setOpenInstitutionId(groupId)}
					size="sm"
					variant="outline"
				>
					<LuList /> Ver contas
				</Button>
			</div>
			<Dialog
				onOpenChange={open => setOpenInstitutionId(open ? groupId : null)}
				open={listOpen}
				url={{ clear: [], parameter: "institutionId", value: groupId }}
			>
				<DialogContent className="gap-4 sm:max-w-3xl">
					<DialogHeader>
						<DialogTitle>{title}</DialogTitle>
						<DialogDescription>
							{accounts.length} {accounts.length === 1 ? "conta" : "contas"}. Abra uma conta
							para ver o extrato.
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div className="grid gap-4 pb-2 md:grid-cols-2">
							{accounts.map(account => (
								<FinancialAccountCard
									account={account}
									compact
									institutions={institutions}
									key={account.id}
									onDelete={() => onDelete(account)}
									onHide={() => onHide(account)}
									onUpdate={onUpdate}
									rewardAccounts={rewardAccounts}
								/>
							))}
						</div>
					</DialogBody>
				</DialogContent>
			</Dialog>
		</article>
	);
}
