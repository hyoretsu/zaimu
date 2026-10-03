import { useState } from "react";
import { LuFileCheck2, LuRefreshCw } from "react-icons/lu";
import { CreditCardImportReviewDialog } from "@/components/credit-card-imports/CreditCardImportReviewDialog";
import { TransactionImportReviewDialog } from "@/components/transaction-imports/TransactionImportReviewDialog";
import { Button } from "@/components/ui/Button";
import { Skeleton } from "@/components/ui/Skeleton";
import { useOpenFinanceStatus } from "@/hooks/use-open-finance";
import { openFinanceApi } from "@/lib/api";
import { showToast } from "@/stores";
export function SyncProgress({ onChanged }: { onChanged: () => Promise<void> }) {
	const status = useOpenFinanceStatus(true);
	const [starting, setStarting] = useState(false);
	const [review, setReview] = useState<{ id: string; kind: string } | null>(null);
	const run = status.data?.run;
	const running = starting || ["QUEUED", "RUNNING"].includes(run?.status ?? "");
	return (
		<section aria-live="polite" className="space-y-4 rounded-xl border p-5">
			<div className="flex flex-wrap items-center justify-between gap-3">
				<h2 className="font-semibold">Busca e importação</h2>
				<Button
					disabled={running}
					onClick={async () => {
						setStarting(true);
						try {
							const result = await openFinanceApi.sync(true);
							await status.refetch();
							if (!result.runId) showToast("Vincule pelo menos uma conta ativa para buscar.", "info");
						} catch (error) {
							showToast(
								error instanceof Error ? error.message : "Não foi possível iniciar busca",
								"negative",
							);
						} finally {
							setStarting(false);
						}
					}}
					variant="outline"
				>
					<LuRefreshCw />
					{running ? "Buscando..." : "Buscar agora"}
				</Button>
			</div>
			<p className="text-muted-foreground text-sm">
				Primeira busca consulta todo histórico disponível. Meu Pluggy coleta dados bancários a cada 24 horas;
				buscar agora consulta os dados já coletados.
			</p>
			{status.isPending ? (
				<Skeleton className="h-24" />
			) : status.isError ? (
				<p role="alert">{status.error.message}</p>
			) : (
				<>
					{run && (
						<div className="grid gap-2 text-sm sm:grid-cols-4">
							<p>{run.processed} registros consultados</p>
							<p>{run.imported} importados</p>
							<p>{run.linked} vinculados</p>
							<p>{run.pending} pendências nesta busca</p>
						</div>
					)}
					{running && <p role="status">Busca em andamento. Pode continuar usando o aplicativo.</p>}
					{run?.errors.map((error, i) => (
						<p className="text-destructive text-sm" key={`${error.connectionId}:${i}`}>
							{error.message}
						</p>
					))}
					{status.data?.reviews.map(item => (
						<Button
							key={item.importId}
							onClick={() => setReview({ id: item.importId, kind: item.kind })}
							variant="outline"
						>
							<LuFileCheck2 />
							Revisar {item.count} {item.count === 1 ? "registro" : "registros"}
						</Button>
					))}
				</>
			)}
			<TransactionImportReviewDialog
				importId={review?.kind === "TRANSACTION" ? review.id : null}
				onOpenChange={open => {
					if (!open) {
						setReview(null);
						void status.refetch();
						void onChanged();
					}
				}}
				open={review?.kind === "TRANSACTION"}
			/>
			<CreditCardImportReviewDialog
				importId={review?.kind === "PURCHASE" ? review.id : null}
				onOpenChange={open => {
					if (!open) {
						setReview(null);
						void status.refetch();
						void onChanged();
					}
				}}
				open={review?.kind === "PURCHASE"}
			/>
		</section>
	);
}
