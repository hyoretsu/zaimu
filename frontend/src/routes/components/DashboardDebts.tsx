import { Link } from "@tanstack/react-router";
import { formatAsset } from "@zaimu/finance/asset-amount";
import { LuArrowRight, LuHandshake } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Card, CardContent, CardHeader, CardTitle } from "@/components/ui/Card";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useUrlModalSelection } from "@/hooks/use-url-modal-selection";
import type { Dashboard } from "@/lib/api";
import { compareDebtPersonNames } from "@/lib/debt-split";

const mobilePreviewLimit = 4;
const desktopPreviewLimit = 5;

export function DashboardDebts({
	debts,
	currencyCode = "BRL",
}: {
	debts: NonNullable<Dashboard["debts"]>;
	currencyCode?: string;
}) {
	const displayAmount = (amount: number | null) =>
		amount === null ? "Conversão indisponível" : formatAsset(amount, currencyCode);
	const [panel, setPanel] = useUrlModalSelection("panel");
	const open = panel === "debts";
	const setOpen = (open: boolean) => setPanel(open ? "debts" : null);
	const people = debts.people.toSorted((left, right) => {
		if (left.balance === null || right.balance === null) {
			if (left.balance === right.balance) return compareDebtPersonNames(left.name, right.name);
			return left.balance === null ? -1 : 1;
		}
		const leftIsPayable = left.balance < 0;
		const rightIsPayable = right.balance < 0;
		if (leftIsPayable !== rightIsPayable) return leftIsPayable ? -1 : 1;
		const balanceOrder = leftIsPayable ? left.balance - right.balance : right.balance - left.balance;
		return balanceOrder || compareDebtPersonNames(left.name, right.name);
	});
	const rows = (items: typeof people, isPreview = false) =>
		items.map((person, index) => (
			<div
				className={
					isPreview && index >= desktopPreviewLimit
						? "hidden"
						: isPreview && index >= mobilePreviewLimit
							? "hidden items-center justify-between gap-6 rounded-xl border p-3 lg:flex"
							: "flex items-center justify-between gap-6 rounded-xl border p-3"
				}
				key={person.id}
			>
				<span className="min-w-0 truncate font-medium">{person.name}</span>
				<strong
					className={`shrink-0 tabular-nums ${person.balance === null ? "text-muted-foreground" : person.balance >= 0 ? "text-emerald-600" : "text-rose-600"}`}
				>
					{displayAmount(person.balance === null ? null : Math.abs(person.balance))}
				</strong>
			</div>
		));
	return (
		<>
			<Card>
				<CardHeader className="flex-row items-center justify-between">
					<CardTitle className="flex items-center gap-2">
						<LuHandshake className="text-primary" /> Dívidas
					</CardTitle>
					<Button
						className="cursor-pointer"
						onClick={() => setOpen(true)}
						size="sm"
						variant="outline"
					>
						Ver todas
					</Button>
				</CardHeader>
				<CardContent className="space-y-3">
					{rows(people, true)}
					{!people.length && (
						<p className="text-muted-foreground text-sm">Nenhuma dívida em aberto.</p>
					)}
				</CardContent>
			</Card>
			<Dialog onOpenChange={setOpen} open={open} url={{ parameter: "panel", value: "debts" }}>
				<DialogContent className="sm:max-w-lg">
					<DialogHeader>
						<DialogTitle>Dívidas em aberto</DialogTitle>
						<DialogDescription>
							<span className="block">A receber: {displayAmount(debts.owedToMe)}</span>
							<span className="block">A pagar: {displayAmount(debts.iOwe)}</span>
							<span className="block">
								Líquido {debts.net === null ? "" : debts.net < 0 ? "a pagar" : "a receber"}:{" "}
								{displayAmount(debts.net === null ? null : Math.abs(debts.net))}
							</span>
						</DialogDescription>
					</DialogHeader>
					<DialogBody>
						<div>
							<div className="space-y-3">{rows(people)}</div>
						</div>
					</DialogBody>
					<DialogFooter>
						<Button asChild className="cursor-pointer" variant="outline">
							<Link to="/debts">
								Gerenciar dívidas <LuArrowRight />
							</Link>
						</Button>
					</DialogFooter>
				</DialogContent>
			</Dialog>
		</>
	);
}
