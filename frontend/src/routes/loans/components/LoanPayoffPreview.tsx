import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { LuCalculator } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { formatCurrency } from "./loan-format";
export function LoanPayoffPreview({ loanId }: { loanId: string }) {
	const [open, setOpen] = useState(false);
	const identity = useCacheIdentity();
	const estimate = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.loans.getEarlyPayoff(loanId),
		queryKey: queryKeys.loans.earlyPayoff(identity!, loanId, "BACK"),
	});
	return (
		<div className="space-y-2">
			<Button className="cursor-pointer" onClick={() => setOpen(value => !value)} variant="outline">
				<LuCalculator />
				{open ? "Minimizar" : "Expandir"} estimativa de quitação
			</Button>
			{open &&
				(estimate.isPending ? (
					<Skeleton className="h-16" />
				) : estimate.isError ? (
					<div role="alert">
						<p>Falha ao calcular estimativa.</p>
						<Button className="cursor-pointer" onClick={() => void estimate.refetch()} variant="outline">
							Tentar novamente
						</Button>
					</div>
				) : (
					<div>
						<p>Principal restante: {formatCurrency(estimate.data.totalToPay)}</p>
						<p>Juros futuros previstos: {formatCurrency(estimate.data.savedInterest)}</p>
						<p className="text-muted-foreground text-xs">
							Estimativa sem juros futuros. Confirme condições e valor de quitação com credor.
						</p>
					</div>
				))}
		</div>
	);
}
