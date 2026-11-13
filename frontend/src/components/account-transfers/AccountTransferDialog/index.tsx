import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useState } from "react";
import { LuSend } from "react-icons/lu";
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
import { inputControlClassName } from "@/components/ui/input-styles";
import { RequiredMark } from "@/components/ui/RequiredMark";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/Tooltip";
import { useDebouncedInput } from "@/hooks/use-debounced-input";
import { useGetAccountTransfersRelatedAccounts } from "@/lib/api";
import { ownershipTransfers } from "@/lib/api/account-transfers";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/auth";
import { TransferAccountSelection } from "./components";

export function AccountTransferDialog({
	accountId,
	institutionId,
	iconOnly = false,
	hideTrigger = false,
	onOpenChange,
	open: controlledOpen,
}: {
	accountId?: string;
	institutionId?: string;
	iconOnly?: boolean;
	hideTrigger?: boolean;
	onOpenChange?: (open: boolean) => void;
	open?: boolean;
}) {
	const [uncontrolledOpen, setUncontrolledOpen] = useState(false);
	const open = controlledOpen ?? uncontrolledOpen;
	const setOpen = (value: boolean) => {
		setUncontrolledOpen(value);
		onOpenChange?.(value);
	};
	const [email, setEmail] = useState("");
	const [localEmail, setLocalEmail] = useDebouncedInput(email, setEmail);
	const [selection, setSelection] = useState<string[]>([]);
	const [primaryId, setPrimaryId] = useState("");
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const accounts = useQuery({
		enabled: open && authenticated,
		queryFn: () => dataService.accounts.getAllIncludingHidden(),
		queryKey: [...queryKeys.accounts.list(identity!), "including-hidden"],
	});
	const baseIds =
		accounts.data
			?.filter(account =>
				accountId
					? account.id === accountId
					: institutionId
						? account.institutionId === institutionId
						: account.id === primaryId,
			)
			.map(account => account.id) ?? [];
	const related = useGetAccountTransfersRelatedAccounts(
		{ query: { accountIds: baseIds.join(",") } },
		{
			query: {
				enabled: open && authenticated && baseIds.length > 0,
				queryKey: ["identity", identity, "account-transfers", "related", ...baseIds.toSorted()],
				retry: false,
			},
		},
	);

	const selected = [
		...new Set([...baseIds, ...selection.filter(id => related.data?.some(account => account.id === id))]),
	];
	const mutation = useMutation({
		mutationFn: ownershipTransfers.create,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["identity", identity, "account-transfers"] });
			toast.success("Convite enviado. Contas permanecem com você até o aceite.");
			setOpen(false);
			setSelection([]);
			setEmail("");
			setLocalEmail("");
		},
	});
	return (
		<Dialog
			onOpenChange={value => {
				if (!mutation.isPending) {
					setOpen(value);
					if (value) {
						setSelection([]);
						setPrimaryId("");
						mutation.reset();
					}
				}
			}}
			open={open}
		>
			{!hideTrigger && (
				<Tooltip>
					<TooltipTrigger asChild>
						<DialogTrigger asChild>
							<Button
								aria-label="Transferir contas"
								size={iconOnly ? "icon-sm" : "default"}
								variant="outline"
							>
								<LuSend />
								{!iconOnly && "Transferir"}
							</Button>
						</DialogTrigger>
					</TooltipTrigger>
					{iconOnly && <TooltipContent>Transferir contas</TooltipContent>}
				</Tooltip>
			)}
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Transferir contas Zaimu</DialogTitle>
					<DialogDescription>
						Outra pessoa receberá cadastro e histórico após aceitar. Você perderá acesso às contas
						transferidas.
					</DialogDescription>
				</DialogHeader>
				{!authenticated ? (
					<>
						<DialogBody>
							<p>
								Entre em uma conta Zaimu para enviar convites. Dados de visitante não podem
								ser transferidos por este fluxo.
							</p>
						</DialogBody>
						<DialogFooter>
							<Button onClick={() => setOpen(false)} variant="outline">
								Fechar
							</Button>
						</DialogFooter>
					</>
				) : (
					<form
						className="flex min-h-0 flex-1 flex-col"
						onSubmit={event => {
							event.preventDefault();
							const recipientEmail = String(
								new FormData(event.currentTarget).get("recipientEmail") ?? "",
							).trim();
							if (
								!recipientEmail ||
								!baseIds.length ||
								related.isPending ||
								related.isError ||
								related.isFetching
							)
								return;
							mutation.mutate({ accountIds: selected, recipientEmail });
						}}
					>
						<DialogBody>
							<div className="space-y-5">
								<label className="grid gap-2">
									<span>
										E-mail do destinatário <RequiredMark />
									</span>
									<input
										autoComplete="email"
										className={`${inputControlClassName} placeholder:text-muted-foreground`}
										name="recipientEmail"
										onChange={event => setLocalEmail(event.currentTarget.value)}
										placeholder="pessoa@exemplo.com"
										required
										type="email"
										value={localEmail}
									/>
								</label>
								{accounts.isPending ? (
									<Skeleton className="h-32 w-full" />
								) : accounts.isError ? (
									<div role="alert">
										<p>Não foi possível carregar contas.</p>
										<Button
											onClick={() => void accounts.refetch()}
											type="button"
											variant="outline"
										>
											Tentar novamente
										</Button>
									</div>
								) : (
									<>
										{!accountId && !institutionId && (
											<div className="grid gap-2">
												<CustomSelect
													label="Conta que será transferida"
													onValueChange={id => {
														setPrimaryId(id);
														setSelection([]);
													}}
													options={(accounts.data ?? []).map(account => ({
														label: getFinancialAccountDisplayName(account),
														value: account.id,
													}))}
													placeholder="Selecione uma conta"
													required
													searchable
													value={primaryId}
												/>
											</div>
										)}
										{(accountId || institutionId) && !baseIds.length && (
											<p role="alert">Conta selecionada não está disponível.</p>
										)}
										{baseIds.length > 0 && (
											<TransferAccountSelection
												accounts={accounts.data ?? []}
												baseIds={baseIds}
												error={related.isError}
												loading={related.isPending}
												onRetry={() => void related.refetch()}
												onSelect={(id, checked) =>
													setSelection(current =>
														checked
															? [...current, id]
															: current.filter(value => value !== id),
													)
												}
												related={related.data ?? []}
												selected={selected}
											/>
										)}
									</>
								)}
								{mutation.isError && (
									<p className="text-destructive" role="alert">
										{mutation.error.message}
									</p>
								)}
							</div>
						</DialogBody>
						<DialogFooter>
							<p
								className="text-muted-foreground w-full border-t pt-3 text-sm"
								data-transfer-effects
							>
								Dívidas e empréstimos ficam com você. Vínculos com contas fora da seleção
								serão separados; algumas recorrências serão pausadas. Convite não expira.
							</p>
							<Button
								disabled={mutation.isPending}
								onClick={() => setOpen(false)}
								type="button"
								variant="outline"
							>
								Descartar
							</Button>
							<Button
								disabled={
									mutation.isPending ||
									accounts.isPending ||
									accounts.isError ||
									!baseIds.length ||
									related.isPending ||
									related.isError ||
									related.isFetching
								}
								type="submit"
							>
								{mutation.isPending ? "Enviando..." : "Enviar convite"}
							</Button>
						</DialogFooter>
					</form>
				)}
			</DialogContent>
		</Dialog>
	);
}
