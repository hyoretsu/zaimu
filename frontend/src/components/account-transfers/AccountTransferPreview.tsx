import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { LuCheck, LuSend, LuX } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ConfirmActionButton } from "@/components/ui/ConfirmActionButton";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { Skeleton } from "@/components/ui/Skeleton";
import { ownershipTransfers } from "@/lib/api/account-transfers";
import { getFinancialAccountTypeLabel } from "@/lib/financial-account";
import { useCacheIdentity } from "@/lib/query-cache";
import { toast } from "@/lib/toast";
import { useAuthStore } from "@/stores/auth";
import { transferStatusLabels } from "./transfer-status";

export function AccountTransferPreview({ id, onClose }: { id: string; onClose: () => void }) {
	const identity = useCacheIdentity();
	const userId = useAuthStore(state => state.user?.id);
	const queryClient = useQueryClient();
	const query = useQuery({
		queryFn: ({ signal }) => ownershipTransfers.preview(id, signal),
		queryKey: ["identity", identity, "account-transfers", id],
		retry: false,
	});
	const mutation = useMutation({
		mutationFn: (action: "accept" | "decline" | "cancel") =>
			ownershipTransfers.respond(id, action, query.data?.version ?? undefined),
		onError: () => void query.refetch(),
		onSuccess: async () => {
			await queryClient.invalidateQueries({ queryKey: ["identity", identity] });
			toast.success("Convite atualizado.");
			onClose();
		},
	});
	const pending = query.data?.transfer.status === "PENDING";
	const recipient = query.data?.transfer.recipientId === userId;
	return (
		<Dialog
			onOpenChange={open => {
				if (!open && !mutation.isPending) onClose();
			}}
			open
			url={{ parameter: "transfer", value: id }}
		>
			<DialogContent>
				<DialogHeader>
					<DialogTitle>Revisar transferência</DialogTitle>
					<DialogDescription>Confira contas e impacto antes de decidir.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					{query.isPending ? (
						<div className="space-y-3">
							<Skeleton className="h-16 w-full" />
							<Skeleton className="h-32 w-full" />
							<Skeleton className="h-16 w-full" />
						</div>
					) : query.isError ? (
						<div role="alert">
							<p>{query.error.message}</p>
							<Button onClick={() => void query.refetch()} variant="outline">
								Atualizar prévia
							</Button>
						</div>
					) : (
						query.data && (
							<div className="space-y-4">
								<p>
									{query.data.transfer.senderName} → {query.data.transfer.recipientName}
								</p>
								<p>{transferStatusLabels[query.data.transfer.status]}</p>
								{query.data.accounts.map(account => (
									<article className="space-y-1 rounded-xl border p-3" key={account.id}>
										<p className="font-semibold">{account.destinationName}</p>
										<p className="text-muted-foreground text-sm">
											{getFinancialAccountTypeLabel(
												account.type as Parameters<
													typeof getFinancialAccountTypeLabel
												>[0],
											)}{" "}
											- {account.institutionName ?? "Sem instituição"}
											{account.isHidden ? " - Escondida" : ""}
										</p>
										{account.type !== "CREDIT_CARD" && (
											<p>
												{new Intl.NumberFormat("pt-BR", {
													maximumFractionDigits: 6,
												}).format(account.balance)}{" "}
												{account.rewardsKind === "POINTS"
													? "pontos"
													: account.currency}
											</p>
										)}
										{account.statements?.map(statement => (
											<p className="text-sm" key={statement.id}>
												Fatura -{" "}
												{new Date(`${statement.dueDate}T12:00:00`).toLocaleDateString(
													"pt-BR",
												)}
												:{" "}
												{new Intl.NumberFormat("pt-BR", {
													currency: statement.currency,
													style: "currency",
												}).format(statement.totalAmount)}{" "}
												- Em aberto:{" "}
												{new Intl.NumberFormat("pt-BR", {
													currency: statement.currency,
													style: "currency",
												}).format(statement.amountDue)}
											</p>
										))}
										{account.name !== account.destinationName && (
											<p className="text-sm">Nome ajustado para evitar conflito.</p>
										)}
									</article>
								))}
								{pending && (
									<>
										<dl className="grid grid-cols-2 gap-2 text-sm">
											<dt>Transações</dt>
											<dd>{query.data.counts.transactions}</dd>
											<dt>Compras / faturas</dt>
											<dd>
												{query.data.counts.purchases} / {query.data.counts.statements}
											</dd>
											<dt>Recorrências transferidas</dt>
											<dd>{query.data.counts.recurrences}</dd>
											<dt>Recorrências pausadas</dt>
											<dd>{query.data.counts.pausedRecurrences}</dd>
											<dt>Movimentos separados</dt>
											<dd>{query.data.counts.separatedMovements}</dd>
											<dt>Importações</dt>
											<dd>{query.data.counts.imports}</dd>
										</dl>
										{query.data.warnings.map(warning => (
											<p className="text-muted-foreground text-sm" key={warning}>
												{warning}
											</p>
										))}
										{recipient && (
											<p className="font-semibold">
												Ao aceitar, você recebe histórico completo. Remetente perde
												acesso. Para devolver contas será necessário novo convite.
											</p>
										)}
									</>
								)}
							</div>
						)
					)}
					{mutation.isError && (
						<p className="text-destructive mt-3" role="alert">
							{mutation.error.message}
						</p>
					)}
				</DialogBody>
				<DialogFooter>
					<Button disabled={mutation.isPending} onClick={onClose} variant="outline">
						Fechar
					</Button>
					{pending &&
						(recipient ? (
							<>
								<Button
									disabled={mutation.isPending || query.isFetching}
									onClick={() => mutation.mutate("decline")}
									variant="outline"
								>
									<LuX />
									Recusar
								</Button>
								<ConfirmActionButton
									confirmation="Confirmar transferência definitiva destas contas?"
									confirmChildren={
										<>
											<LuCheck />
											Confirmar transferência
										</>
									}
									disabled={mutation.isPending || query.isFetching}
									onConfirm={() =>
										mutation
											.mutateAsync("accept")
											.then(() => undefined)
											.catch(() => undefined)
									}
								>
									<LuSend />
									{mutation.isPending ? "Processando..." : "Aceitar transferência"}
								</ConfirmActionButton>
							</>
						) : (
							<Button
								disabled={mutation.isPending}
								onClick={() => mutation.mutate("cancel")}
								variant="outline"
							>
								<LuX />
								Cancelar convite
							</Button>
						))}
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
