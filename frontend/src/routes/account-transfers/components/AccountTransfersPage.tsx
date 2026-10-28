import { LuEye } from "react-icons/lu";
import { AccountTransferDialog, AccountTransferPreview } from "@/components/account-transfers";
import { transferStatusLabels } from "@/components/account-transfers/transfer-status";
import { PushNotificationControl } from "@/components/notifications/PushNotificationControl";
import { Button } from "@/components/ui/Button";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { Skeleton } from "@/components/ui/Skeleton";
import { useAccountTransfers } from "@/hooks/use-account-transfers";
import { useUrlModalSelection } from "@/hooks/use-url-modal-selection";
import { useAuthStore } from "@/stores/auth";

export function AccountTransfersPage() {
	const transfers = useAccountTransfers();
	const authenticated = useAuthStore(state => state.isAuthenticated);
	const userId = useAuthStore(state => state.user?.id);
	const [selected, setSelected] = useUrlModalSelection("transfer");
	return (
		<PageContainer>
			<PageHeader
				controls={<AccountTransferDialog />}
				description="Envie contas e histórico para outra pessoa ou revise convites recebidos."
				title="Transferências de contas"
			/>
			{!authenticated ? (
				<p>Entre em uma conta Zaimu para transferir contas.</p>
			) : (
				<>
					<PushNotificationControl />
					{transfers.isPending ? (
						<div className="space-y-3">
							<Skeleton className="h-24 w-full" />
							<Skeleton className="h-24 w-full" />
						</div>
					) : transfers.isError ? (
						<div role="alert">
							<p>{transfers.error.message}</p>
							<Button onClick={() => void transfers.refetch()} variant="outline">
								Tentar novamente
							</Button>
						</div>
					) : !transfers.data?.length ? (
						<p className="text-muted-foreground">Nenhum convite enviado ou recebido.</p>
					) : (
						<div className="space-y-3">
							{transfers.data.map(transfer => (
								<article
									className="flex flex-wrap items-center justify-between gap-3 rounded-xl border p-4"
									key={transfer.id}
								>
									<div className="min-w-0 space-y-1">
										<p className="font-semibold">
											{transfer.senderId === userId
												? `Enviado para ${transfer.recipientName}`
												: `Recebido de ${transfer.senderName}`}
										</p>
										<p className="text-muted-foreground text-sm break-words">
											{transfer.summary.accounts
												.map(account => account.name || "Conta")
												.join(", ")}
										</p>
										<p className="text-sm">{transferStatusLabels[transfer.status]}</p>
									</div>
									<Button onClick={() => setSelected(transfer.id)} variant="outline">
										<LuEye />
										Revisar
									</Button>
								</article>
							))}
						</div>
					)}
					{selected && <AccountTransferPreview id={selected} onClose={() => setSelected(null)} />}
				</>
			)}
		</PageContainer>
	);
}
