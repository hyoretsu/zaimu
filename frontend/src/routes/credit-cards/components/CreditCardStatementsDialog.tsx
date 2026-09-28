import { type InfiniteData, useInfiniteQuery } from "@tanstack/react-query";
import { useMemo, useState } from "react";
import { LuReceiptText } from "react-icons/lu";
import { Dialog, DialogContent, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import type { CreditCard, CreditCardStatement, CreditCardStatementPage } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalMonthKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CreditCardStatementDetails } from "./CreditCardStatementDetails";
import { CreditCardStatementTabs } from "./CreditCardStatementTabs";

function getStatementReferenceDate(statement: CreditCardStatement) {
	return statement.dueDate;
}

export function CreditCardStatementsDialog({
	card,
	onOpenChange,
}: {
	card: CreditCard | null;
	onOpenChange: (open: boolean) => void;
}) {
	const identity = useCacheIdentity();
	const [selectedStatementId, setSelectedStatementId] = useState<string | null>(null);
	const statements = useInfiniteQuery<
		CreditCardStatementPage,
		Error,
		InfiniteData<CreditCardStatementPage>,
		ReturnType<typeof queryKeys.creditCardStatements.list>,
		string | undefined
	>({
		enabled: identity !== null && Boolean(card),
		getNextPageParam: lastPage => (lastPage.hasMore ? (lastPage.nextCursor ?? undefined) : undefined),
		initialPageParam: undefined as string | undefined,
		queryFn: ({ pageParam }) => dataService.creditCards.getStatementPage(card!.id, { cursor: pageParam }),
		queryKey: queryKeys.creditCardStatements.list(identity!, card?.id ?? "unselected"),
	});
	const currentMonth = getLocalMonthKey(new Date());
	const visibleStatements = useMemo(
		() =>
			(statements.data?.pages.flatMap(page => page.items) ?? []).toSorted((left, right) =>
				left.dueDate.localeCompare(right.dueDate),
			),
		[statements.data],
	);
	const currentStatement = visibleStatements?.find(
		statement => getLocalMonthKey(getStatementReferenceDate(statement)) === currentMonth,
	);
	const selectedStatement =
		visibleStatements?.find(statement => statement.id === selectedStatementId) ??
		currentStatement ??
		visibleStatements?.at(-1);

	return (
		<Dialog onOpenChange={onOpenChange} open={Boolean(card)}>
			<DialogContent className="grid max-h-[min(90dvh,46rem)] grid-rows-[auto_minmax(0,1fr)] gap-4 overflow-hidden p-4 sm:max-w-5xl sm:gap-6 sm:p-6">
				<DialogHeader>
					<DialogTitle>Faturas de {card?.accountName ?? "Cartão de crédito"}</DialogTitle>
					<DialogDescription>Selecione um mês para consultar os detalhes e as transações.</DialogDescription>
				</DialogHeader>
				{statements.isPending ? (
					<div className="grid min-h-0 grid-rows-[7.5rem_minmax(0,1fr)] gap-4 sm:grid-cols-[11rem_minmax(0,1fr)] sm:grid-rows-1 sm:gap-6">
						<div className="grid content-start gap-2 overflow-hidden border-b pb-3 sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0">
							{[1, 2, 3, 4].map(item => (
								<Skeleton className="h-20" key={item} />
							))}
						</div>
						<Skeleton className="h-full" />
					</div>
				) : statements.isError ? (
					<EmptyState
						description="Tente novamente em instantes."
						icon={<LuReceiptText className="size-7" />}
						title="Não foi possível carregar as faturas"
					/>
				) : selectedStatement ? (
					<Tabs
						className="grid min-h-0 grid-rows-[7.5rem_minmax(0,1fr)] gap-0 sm:grid-cols-[11rem_minmax(0,1fr)] sm:grid-rows-1"
						onValueChange={setSelectedStatementId}
						orientation="vertical"
						value={selectedStatement.id}
					>
						<CreditCardStatementTabs
							hasMore={statements.hasNextPage}
							isLoadingMore={statements.isFetchingNextPage}
							onLoadMore={() => statements.fetchNextPage()}
							selectedId={selectedStatement.id}
							statements={visibleStatements}
						/>
						<CreditCardStatementDetails key={selectedStatement.id} statement={selectedStatement} />
					</Tabs>
				) : (
					<EmptyState
						description="As faturas aparecerão aqui depois da primeira compra."
						icon={<LuReceiptText className="size-7" />}
						title="Nenhuma fatura registrada"
					/>
				)}
			</DialogContent>
		</Dialog>
	);
}
