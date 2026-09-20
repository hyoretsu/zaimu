import { useQuery } from "@tanstack/react-query";
import { Link } from "@tanstack/react-router";
import { LuBellRing, LuChevronRight } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";

export function DashboardDebtInvitations() {
	const identity = useCacheIdentity();
	const invitations = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.debts.getInvitations(),
		queryKey: queryKeys.debts.invitations(identity!),
	});
	const received = (invitations.data ?? []).filter(
		invitation => invitation.direction === "RECEIVED" && invitation.status === "PENDING",
	);
	if (!received.length) return null;
	return (
		<section className="rounded-2xl border border-primary/25 bg-primary/5 p-4" role="status">
			<div className="flex items-start gap-3">
				<LuBellRing className="mt-0.5 shrink-0 text-primary" />
				<div className="min-w-0 flex-1">
					<h2 className="font-semibold">
						{received.length === 1 ? "Novo convite de dívida" : "Novos convites de dívida"}
					</h2>
					<p className="mt-1 text-muted-foreground text-sm">
						{received.length === 1
							? `${received[0]?.counterpartyName} quer compartilhar uma dívida com você.`
							: `${received.length} pessoas querem compartilhar dívidas com você.`}
					</p>
				</div>
			</div>
			<Button asChild className="mt-3 w-full cursor-pointer sm:w-auto" size="sm" variant="outline">
				<Link to="/debts">
					Revisar convites <LuChevronRight />
				</Link>
			</Button>
		</section>
	);
}
