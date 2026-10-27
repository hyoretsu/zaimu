import { useMutation } from "@tanstack/react-query";
import { LuEye } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import type { FinancialAccount } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountOptionLabel } from "@/lib/financial-account";
import { showToast } from "@/stores";

export function HiddenAccountRow({ account }: { account: FinancialAccount }) {
	const isCard = account.type === "CREDIT_CARD";
	const restore = useMutation({
		meta: { cacheOperations: [isCard ? "creditCard" : "account"] },
		mutationFn: () => dataService.accounts.update(account.id, { isHidden: false }),
		onError: error => showToast(error.message, "negative"),
		onSuccess: () =>
			showToast(isCard ? "Cartão exibido novamente." : "Conta exibida novamente.", "positive"),
	});
	return (
		<div className="bg-card flex items-center justify-between gap-3 rounded-xl border p-3">
			<span className="truncate">{getFinancialAccountOptionLabel(account)}</span>
			<Button
				aria-label={`Mostrar ${getFinancialAccountOptionLabel(account)}`}
				className="cursor-pointer"
				disabled={restore.isPending}
				onClick={() => restore.mutate()}
				size="sm"
				variant="outline"
			>
				<LuEye /> Mostrar
			</Button>
		</div>
	);
}
