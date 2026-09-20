import { type SyntheticEvent, useState } from "react";
import { LuLandmark, LuPencil, LuTrash2, LuWalletCards } from "react-icons/lu";
import { AppBadge } from "@/components/ui/AppBadge";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
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
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import type { FinancialAccount, FinancialInstitution, FinancialInstitutionYieldPolicy } from "@/lib/api";
import { getFinancialAccountCurrencyValue } from "@/lib/financial-account";
import { CreateFinancialAccountDialog } from "./CreateFinancialAccountDialog";
import { FinancialAccountCard } from "./FinancialAccountCard";
import { InstitutionYieldDialog } from "./InstitutionYieldDialog";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function FinancialInstitutionGroup({
	accounts,
	institution,
	institutions,
	onCreate,
	onDelete,
	onUpdate,
	onUpdateInstitution,
	onUpdateInstitutionYield,
	onDeleteInstitution,
	pending,
	rewardAccounts,
}: {
	accounts: FinancialAccount[];
	institution: FinancialInstitution | null;
	institutions: FinancialInstitution[];
	onCreate: Parameters<typeof CreateFinancialAccountDialog>[0]["onCreate"];
	onDelete: (account: FinancialAccount) => void | Promise<void>;
	onUpdate: NonNullable<Parameters<typeof CreateFinancialAccountDialog>[0]["onUpdate"]>;
	onUpdateInstitution: (institution: FinancialInstitution, name: string) => Promise<unknown>;
	onUpdateInstitutionYield: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
	onDeleteInstitution: (institution: FinancialInstitution) => Promise<unknown>;
	pending: boolean;
	rewardAccounts: FinancialAccount[];
}) {
	const balance = accounts
		.filter(account => account.type !== "CREDIT_CARD")
		.reduce((total, account) => total + getFinancialAccountCurrencyValue(account), 0);
	const Icon = institution ? LuLandmark : LuWalletCards;

	return (
		<section className="grid gap-4 rounded-3xl border bg-card/35 p-4 shadow-card sm:p-5">
			<header className="flex flex-wrap items-center justify-between gap-4 border-border/70 border-b pb-4">
				<div className="flex min-w-0 items-center gap-3">
					<span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-primary/10 text-primary">
						<Icon className="size-5" />
					</span>
					<div className="min-w-0">
						<div className="flex flex-wrap items-center gap-2">
							<h2 className="truncate font-bold text-lg">{institution?.name ?? "Sem instituição"}</h2>
							<AppBadge variant="secondary">
								{accounts.length} {accounts.length === 1 ? "produto" : "produtos"}
							</AppBadge>
						</div>
						<p className="mt-0.5 text-muted-foreground text-sm">
							Saldo consolidado: <strong className="text-foreground">{currency.format(balance)}</strong>
						</p>
					</div>
				</div>
				<div className="ml-auto flex items-center gap-2">
					{institution && (
						<InstitutionActions
							institution={institution}
							onDelete={onDeleteInstitution}
							onUpdate={onUpdateInstitution}
							onUpdateYield={onUpdateInstitutionYield}
						/>
					)}
					<CreateFinancialAccountDialog
						contextual
						defaultInstitutionId={institution?.id ?? null}
						institutions={institutions}
						onCreate={onCreate}
						pending={pending}
						rewardAccounts={rewardAccounts}
					/>
				</div>
			</header>
			<div className="grid gap-4 md:grid-cols-2 xl:grid-cols-3">
				{accounts.map(account => (
					<FinancialAccountCard
						account={account}
						institutions={institutions}
						key={account.id}
						onDelete={() => onDelete(account)}
						onUpdate={onUpdate}
						rewardAccounts={rewardAccounts}
					/>
				))}
			</div>
		</section>
	);
}

function InstitutionActions({
	institution,
	onDelete,
	onUpdate,
	onUpdateYield,
}: {
	institution: FinancialInstitution;
	onDelete: (institution: FinancialInstitution) => Promise<unknown>;
	onUpdate: (institution: FinancialInstitution, name: string) => Promise<unknown>;
	onUpdateYield: (
		institution: FinancialInstitution,
		policy: Omit<FinancialInstitutionYieldPolicy, "effectiveDate">,
	) => Promise<unknown>;
}) {
	return (
		<>
			<InstitutionYieldDialog institution={institution} onUpdate={onUpdateYield} />
			<EditInstitutionDialog institution={institution} onUpdate={onUpdate} />
			<ConfirmActionButton
				aria-label={`Excluir ${institution.name}`}
				className="cursor-pointer"
				confirmation={`Excluir ${institution.name}? Produtos serão mantidos sem instituição.`}
				onConfirm={async () => {
					await onDelete(institution);
				}}
				size="sm"
				variant="destructive"
			>
				<LuTrash2 /> Excluir
			</ConfirmActionButton>
		</>
	);
}

function EditInstitutionDialog({
	institution,
	onUpdate,
}: {
	institution: FinancialInstitution;
	onUpdate: (institution: FinancialInstitution, name: string) => Promise<unknown>;
}) {
	const [open, setOpen] = useState(false);
	const [name, setName] = useDebouncedInput(institution.name, () => undefined);
	const submit = async (event: SyntheticEvent<HTMLFormElement>) => {
		event.preventDefault();
		try {
			await onUpdate(institution, name.trim());
			setOpen(false);
		} catch {
			return;
		}
	};
	return (
		<Dialog onOpenChange={setOpen} open={open}>
			<DialogTrigger asChild>
				<Button
					aria-label={`Editar ${institution.name}`}
					className="cursor-pointer"
					size="sm"
					variant="outline"
				>
					<LuPencil /> Editar
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Editar instituição</DialogTitle>
					<DialogDescription>O nome será atualizado em todas as contas deste grupo.</DialogDescription>
				</DialogHeader>
				<form className="grid gap-5" onSubmit={submit}>
					<FormField
						autoComplete="organization"
						id={`institution-${institution.id}`}
						label="Nome da instituição"
						name="institution-name"
						onChange={event => setName(event.currentTarget.value)}
						placeholder="Ex: Mercado Pago"
						required
						type="text"
						value={name}
					/>
					<DialogFooter>
						<Button className="cursor-pointer" onClick={() => setOpen(false)} type="button" variant="outline">
							Descartar
						</Button>
						<Button
							className="cursor-pointer disabled:cursor-not-allowed"
							disabled={!name.trim()}
							type="submit"
						>
							Salvar
						</Button>
					</DialogFooter>
				</form>
			</DialogContent>
		</Dialog>
	);
}
