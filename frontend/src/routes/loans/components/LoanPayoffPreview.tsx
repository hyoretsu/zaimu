import { useQuery } from "@tanstack/react-query";
import { useState } from "react";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ActionGroup } from "@/components/ui/ActionGroup";
import { Button } from "@/components/ui/Button";
import { FormSection } from "@/components/ui/FormSection";
import { Skeleton } from "@/components/ui/Skeleton";
import { dataService } from "@/lib/dataService";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
export function LoanPayoffPreview({ loanId }: { loanId: string }) {
	const [open, setOpen] = useState(false);
	const identity = useCacheIdentity();
	const estimate = useQuery({
		enabled: open && identity !== null,
		queryFn: () => dataService.loans.getEarlyPayoff(loanId),
		queryKey: queryKeys.loans.earlyPayoff(identity!, loanId, "BACK"),
	});
	return (
		<FormSection
			onExpandedChange={setOpen}
			summary="Principal restante e juros futuros previstos"
			title="Estimativa de quitação"
		>
			{open &&
				(estimate.isPending ? (
					<Skeleton className="h-16" />
				) : estimate.isError ? (
					<div role="alert">
						<p>Falha ao calcular estimativa.</p>
						<ActionGroup>
							<Button
								className="cursor-pointer"
								onClick={() => void estimate.refetch()}
								variant="outline"
							>
								Tentar novamente
							</Button>
						</ActionGroup>
					</div>
				) : (
					<div>
						<p>
							Principal restante:{" "}
							<PreferredMoneyAmount
								values={[
									{
										amount: estimate.data.totalToPay,
										currency: estimate.data.currency ?? "BRL",
									},
								]}
							/>
						</p>
						<p>
							Juros futuros previstos:{" "}
							<PreferredMoneyAmount
								values={[
									{
										amount: estimate.data.savedInterest,
										currency: estimate.data.currency ?? "BRL",
									},
								]}
							/>
						</p>
						<p className="text-muted-foreground text-xs">
							Estimativa sem juros futuros. Confirme condições e valor de quitação com credor.
						</p>
					</div>
				))}
		</FormSection>
	);
}
