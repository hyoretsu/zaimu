import { useQuery } from "@tanstack/react-query";
import { LuFileClock } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { dataService } from "@/lib/dataService";

export function PendingCreditCardImportsNotice({ onReview }: { onReview: (importId: string) => void }) {
	const imports = useQuery({
		queryFn: dataService.creditCardImports.getPending,
		queryKey: ["pending-credit-card-imports"],
	});
	if (!imports.data?.length) return null;
	const purchases = imports.data.reduce((total, item) => total + item.items.length, 0);
	return (
		<section className="flex flex-col gap-3 rounded-2xl border border-amber-500/35 bg-amber-500/10 p-4 sm:flex-row sm:items-center sm:justify-between">
			<div className="flex items-center gap-3">
				<LuFileClock className="size-5 text-amber-700" />
				<div>
					<p className="font-medium text-sm">Faturas aguardando revisão</p>
					<p className="text-muted-foreground text-xs">
						{imports.data.length} {imports.data.length === 1 ? "fatura" : "faturas"} · {purchases}{" "}
						{purchases === 1 ? "compra" : "compras"}
					</p>
				</div>
			</div>
			<Button className="cursor-pointer" onClick={() => onReview(imports.data[0]!.id)} variant="outline">
				Revisar
			</Button>
		</section>
	);
}
