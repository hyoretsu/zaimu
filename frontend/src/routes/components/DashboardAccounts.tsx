import { Link } from "@tanstack/react-router";
import { useState } from "react";
import { LuArrowRight, LuLandmark } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { Dashboard } from "@/lib/api";
import { formatLocalDate } from "@/lib/date";
import { getFinancialAccountSummaryName } from "@/lib/financial-account";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });
const mobilePreviewLimit = 4;
const desktopPreviewLimit = 9;

interface DashboardAccountsProps extends Pick<Dashboard, "accounts"> {
	endDate: string;
}

export function DashboardAccounts({ accounts, endDate }: DashboardAccountsProps) {
	const [open, setOpen] = useState(false);
	const getName = (account: Dashboard["accounts"][number]) =>
		getFinancialAccountSummaryName({
			institution: account.institutionName ? { name: account.institutionName } : null,
			name: account.name,
			type: account.type,
		});
	const ordered = accounts
		.filter(account => account.balance !== 0)
		.toSorted((left, right) => right.balance - left.balance);
	return (
		<>
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<div>
						<CardTitle className="flex items-center gap-2">
							<LuLandmark className="text-primary" /> Contas
						</CardTitle>
						<p className="mt-1 text-muted-foreground text-xs">Saldos em {formatLocalDate(endDate)}</p>
					</div>
					<Button className="cursor-pointer" onClick={() => setOpen(true)} size="sm" variant="outline">
						Ver todas <LuArrowRight />
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{ordered.map((account, index) => (
						<div
							className={
								index >= desktopPreviewLimit
									? "hidden"
									: index >= mobilePreviewLimit
										? "hidden items-center justify-between rounded-xl border p-3 lg:flex"
										: "flex items-center justify-between rounded-xl border p-3"
							}
							key={account.id}
						>
							<span>{getName(account)}</span>
							<strong>{currency.format(account.balance)}</strong>
						</div>
					))}
					{!ordered.length && <p className="text-muted-foreground text-sm">Nenhuma conta com saldo.</p>}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open}>
				<DialogContent className="max-h-[calc(100dvh-2rem)] sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Todas as contas</DialogTitle>
						<DialogDescription>
							Contas correntes e poupanças incluídas no saldo em {formatLocalDate(endDate)}.
						</DialogDescription>
					</DialogHeader>
					<ScrollArea className="max-h-[min(30rem,calc(100dvh-14rem))] pr-3">
						<div className="space-y-3">
							{!ordered.length && <p className="text-muted-foreground text-sm">Nenhuma conta com saldo.</p>}
							{ordered.map(account => (
								<div
									className="flex items-center justify-between gap-3 rounded-xl border p-3"
									key={account.id}
								>
									<div className="min-w-0">
										<p className="font-medium">{getName(account)}</p>
										<p className="text-muted-foreground text-xs">
											{account.type === "SAVINGS" ? "Poupança" : "Conta corrente"}
										</p>
									</div>
									<div className="flex shrink-0 flex-col items-end gap-2 text-right">
										<strong className="tabular-nums">{currency.format(account.balance)}</strong>
										<Button asChild className="cursor-pointer" size="sm" variant="outline">
											<Link to="/accounts">
												Extrato <LuArrowRight />
											</Link>
										</Button>
									</div>
								</div>
							))}
						</div>
					</ScrollArea>
					<Button asChild className="cursor-pointer" variant="outline">
						<Link to="/accounts">
							Gerenciar contas <LuArrowRight />
						</Link>
					</Button>
				</DialogContent>
			</Dialog>
		</>
	);
}
