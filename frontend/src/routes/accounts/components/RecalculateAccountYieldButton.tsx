import { useMutation } from "@tanstack/react-query";
import { LuRefreshCw } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { recalculateAccountYield } from "@/lib/account-yield-recalculation";
import type { FinancialAccount } from "@/lib/api";
import { showToast } from "@/stores";

export function RecalculateAccountYieldButton({ account }: { account: FinancialAccount }) {
	const mutation = useMutation({
		meta: { cacheOperations: ["account"] },
		mutationFn: () => recalculateAccountYield(account.id),
		onError: error => showToast(error.message, "negative"),
		onSuccess: () => showToast("Rendimento histórico recalculado.", "positive"),
	});

	return (
		<Button
			className="mt-2 w-full cursor-pointer"
			disabled={mutation.isPending}
			onClick={() => mutation.mutate()}
			size="sm"
			variant="outline"
		>
			<LuRefreshCw className={mutation.isPending ? "animate-spin" : undefined} />
			{mutation.isPending ? "Recalculando..." : "Recalcular rendimento"}
		</Button>
	);
}
