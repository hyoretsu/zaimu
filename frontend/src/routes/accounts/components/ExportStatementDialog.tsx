import { useState } from "react";
import { LuDownload } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { DateRangePicker } from "@/components/ui/DateRangePicker";
import type { DateRangeValue } from "@/components/ui/DateRangePicker/types";
import {
	Dialog,
	DialogBody,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogTitle,
} from "@/components/ui/Dialog";
import { useDialogCloseReset } from "@/hooks/use-dialog-close-reset";
import type { FinancialAccount, Transaction } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getFinancialAccountDisplayName } from "@/lib/financial-account";
import { buildStatementCsv, downloadCsv } from "@/lib/statement-csv";
import { showToast } from "@/stores";

export function ExportStatementDialog({
	account,
	onOpenChange,
	open,
}: {
	account: FinancialAccount;
	onOpenChange: (open: boolean) => void;
	open: boolean;
}) {
	const [range, setRange] = useState<DateRangeValue>({});
	const [exporting, setExporting] = useState(false);
	useDialogCloseReset(open, () => setRange({}));

	const exportCsv = async () => {
		setExporting(true);
		try {
			const transactions: Transaction[] = [];
			let cursor: string | undefined;
			do {
				const page = await dataService.transactions.getDailyPage({
					cursor,
					endDate: range.endDate,
					financialAccountId: account.id,
					limit: 50,
					startDate: range.startDate,
				});
				transactions.push(...page.days.flatMap(day => day.transactions));
				cursor = page.nextCursor ?? undefined;
			} while (cursor);
			downloadCsv(
				`extrato-${getFinancialAccountDisplayName(account)}.csv`,
				buildStatementCsv(transactions, account.id),
			);
			showToast("Extrato exportado.", "positive");
			onOpenChange(false);
		} catch {
			showToast("Não foi possível exportar extrato.", "negative");
		} finally {
			setExporting(false);
		}
	};

	return (
		<Dialog onOpenChange={nextOpen => !exporting && onOpenChange(nextOpen)} open={open}>
			<DialogContent className="sm:max-w-md">
				<DialogHeader>
					<DialogTitle>Exportar extrato</DialogTitle>
					<DialogDescription>
						Escolha período do arquivo CSV. Sem período, todo extrato é exportado.
					</DialogDescription>
				</DialogHeader>
				<DialogBody>
					<div className="grid min-w-0 gap-2">
						<p className="text-sm leading-none font-medium">Período</p>
						<DateRangePicker
							className="w-full max-w-full min-w-0 overflow-hidden [&>span]:truncate"
							onChange={setRange}
							value={range}
						/>
					</div>
				</DialogBody>
				<DialogFooter>
					<Button disabled={exporting} onClick={() => onOpenChange(false)} variant="outline">
						Cancelar
					</Button>
					<Button disabled={exporting} onClick={exportCsv}>
						<LuDownload />
						{exporting ? "Exportando..." : "Exportar"}
					</Button>
				</DialogFooter>
			</DialogContent>
		</Dialog>
	);
}
