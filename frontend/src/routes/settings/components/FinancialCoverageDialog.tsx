import { LuChartNoAxesCombined } from "react-icons/lu";
import { FinancialSourceCoverage } from "@/components/financial-coverage";
import { Button } from "@/components/ui/Button";
import {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
	DialogTrigger,
} from "@/components/ui/Dialog";
export function FinancialCoverageDialog() {
	const year = new Date().getFullYear();
	return (
		<Dialog>
			<DialogTrigger asChild>
				<Button variant="outline">
					<LuChartNoAxesCombined />
					Cobertura financeira
				</Button>
			</DialogTrigger>
			<DialogContent className="sm:max-w-3xl">
				<DialogHeader>
					<DialogTitle>Cobertura financeira</DialogTitle>
					<DialogDescription>Fontes e lacunas das suas contas no ano atual.</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<FinancialSourceCoverage admin={false} endDate={`${year}-12-31`} startDate={`${year}-01-01`} />
				</DialogBody>
				<DialogFooter>
					<DialogClose asChild>
						<Button variant="outline">Fechar</Button>
					</DialogClose>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
