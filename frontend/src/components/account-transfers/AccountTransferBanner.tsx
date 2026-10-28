import { Link } from "@tanstack/react-router";
import { useAccountTransfers } from "@/hooks/use-account-transfers";
import { useAuthStore } from "@/stores/auth";

export function AccountTransferBanner() {
	const userId = useAuthStore(state => state.user?.id);
	const transfers = useAccountTransfers();
	const pending =
		transfers.data?.filter(row => row.recipientId === userId && row.status === "PENDING") ?? [];
	if (!pending.length) return null;
	return (
		<aside
			aria-label="Convites de transferência"
			className="border-primary/30 bg-primary/10 rounded-xl border p-3 text-sm"
		>
			<Link className="text-primary cursor-pointer font-semibold underline" to="/account-transfers">
				Você tem {pending.length}{" "}
				{pending.length === 1
					? "convite de transferência pendente"
					: "convites de transferência pendentes"}
				. Revisar contas.
			</Link>
		</aside>
	);
}
