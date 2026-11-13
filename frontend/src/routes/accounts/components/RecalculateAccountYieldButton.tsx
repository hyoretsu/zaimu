import { useMutation } from "@tanstack/react-query";
import { LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { recalculateAccountYield } from "@/lib/account-yield-recalculation";
import type { FinancialAccount } from "@/lib/api";
import { showToast } from "@/stores";

export function useRecalculateAccountYield(account: FinancialAccount) {
	return useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: () => recalculateAccountYield(account.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: () => showToast("Rendimentos históricos recalculados.", "positive"),
	});
}

export function RecalculateAccountYieldButton({ account }: { account: FinancialAccount }) {
	const mutation = useRecalculateAccountYield(account);

	return (
		<Button
			className="w-full cursor-pointer justify-start"
			disabled={mutation.isPending}
			onClick={() => mutation.mutate()}
			size="sm"
			variant="outline"
		>
			<LuRefreshCw className={mutation.isPending ? "animate-spin" : undefined} />
			{mutation.isPending ? "Recalculando..." : "Recalcular rendimentos"}
		</Button>
	);
}
