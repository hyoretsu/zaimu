import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useId, useState } from "react";
import { LuSend } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Checkbox } from "@/components/ui/Checkbox";
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
import { ownershipTransfers } from "@/lib/api/account-transfers";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/auth";

export function AccountTransferDialog({
	accountId,
	institutionId,
	iconOnly = false,
}: {
	accountId?: string;
	institutionId?: string;
	iconOnly?: boolean;
}) {
	const formId = useId();
	const [open, setOpen] = useState(false);
	const [email, setEmail] = useState("");
	const [localEmail, setLocalEmail] = useDebouncedInput(email, setEmail);
	const [selection, setSelection] = useState<string[] | null>(null);
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const identity = useCacheIdentity();
	const queryClient = useQueryClient();
	const accounts = useQuery({
		enabled: open && authenticated,
		queryFn: () => dataService.accounts.getAllIncludingHidden(),
		queryKey: [...queryKeys.accounts.list(identity!), "including-hidden"],
	});
	const selected =
		selection ??
		accounts.data
			?.filter(account =>
				accountId
					? account.id === accountId
					: institutionId
						? account.institutionId === institutionId
						: false,
			)
			.map(account => account.id) ??
		[];
	const mutation = useMutation({
		mutationFn: ownershipTransfers.create,
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["identity", identity, "account-transfers"] });
			toast.success("Convite enviado. Contas permanecem com você até o aceite.");
			setOpen(false);
			setSelection(null);
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
						setSelection(null);
						mutation.reset();
					}
				}
			}}
			open={open}
		>
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
							if (!recipientEmail || !selected.length) return;
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
								<fieldset className="space-y-3">
									<legend className="mb-2 font-semibold">
										Contas <RequiredMark />
									</legend>
									{accounts.isPending ? (
										<Skeleton className="h-32 w-full" />
									) : accounts.isError ? (
										<p role="alert">
											Não foi possível carregar contas.{" "}
											<Button
												onClick={() => void accounts.refetch()}
												type="button"
												variant="outline"
											>
												Tentar novamente
											</Button>
										</p>
									) : (
										accounts.data?.map(account => (
											<label
												className="flex cursor-pointer items-center gap-3 rounded-xl border p-3"
												htmlFor={`${formId}-${account.id}`}
												key={account.id}
											>
												<Checkbox
													checked={selected.includes(account.id)}
													id={`${formId}-${account.id}`}
													onCheckedChange={checked =>
														setSelection(
															checked
																? [...selected, account.id]
																: selected.filter(id => id !== account.id),
														)
													}
												/>
												<span className="min-w-0 break-words">
													{getFinancialAccountDisplayName(account)}
													{account.isHidden ? " - Escondida" : ""}
												</span>
											</label>
										))
									)}
								</fieldset>
								<p className="text-muted-foreground text-sm">
									Dívidas e empréstimos ficam com você. Vínculos com contas fora da seleção
									serão separados; algumas recorrências serão pausadas. Convite não expira.
								</p>
								{mutation.isError && (
									<p className="text-destructive" role="alert">
										{mutation.error.message}
									</p>
								)}
							</div>
						</DialogBody>
						<DialogFooter>
							<Button
								disabled={mutation.isPending}
								onClick={() => setOpen(false)}
								type="button"
								variant="outline"
							>
								Descartar
							</Button>
							<Button
								disabled={mutation.isPending || accounts.isPending || !selected.length}
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
