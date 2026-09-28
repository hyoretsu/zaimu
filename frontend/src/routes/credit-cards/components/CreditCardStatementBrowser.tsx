import { useMutation, useQuery, useQueryClient } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { LuReceiptText } from "react-icons/lu";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CreditCard } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalMonthKey } from "@/lib/date";
import { invalidateCacheOperation, queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { showToast } from "@/stores";
import { CreditCardStatementDetails } from "./CreditCardStatementDetails";
import { CreditCardStatementTabs } from "./CreditCardStatementTabs";
import { getFirstNonZeroStatementMonth, getStatementWindow } from "./credit-card-statement-window";

export function CreditCardStatementBrowser({ card }: { card: CreditCard }) {
	const queryClient = useQueryClient();
	const identity = useCacheIdentity();
	const [ignoreBefore, setIgnoreBefore] = useState(card.ignoreStatementsBefore?.slice(0, 10) ?? null);
	const cutoff = useMutation({
		mutationFn: (statementDate: string | null) =>
			dataService.creditCards.setStatementCutoff(card.id, statementDate),
		onError: error =>
			showToast(
				error instanceof Error ? error.message : "Não foi possível atualizar as faturas.",
				"negative",
			),
		onSuccess: async (_, statementDate) => {
			setIgnoreBefore(statementDate);
			await invalidateCacheOperation(queryClient, identity!, "creditCard");
			showToast(
				statementDate ? "Faturas anteriores desconsideradas." : "Histórico de faturas restaurado.",
				"positive",
			);
		},
	});
	const isDesktop = useMediaQuery("(min-width: 640px)");
	const [desktopRadius, setDesktopRadius] = useState(6);
	const radius = isDesktop ? desktopRadius : 3;
	const [extra, setExtra] = useState({ next: 0, previous: 0 });
	const [selectedMonth, setSelectedMonth] = useState<string | null>(null);
	const [currentMonth] = useState(() => getLocalMonthKey(new Date()));
	const statements = useQuery({
		enabled: identity !== null,
		queryFn: () => dataService.creditCards.getStatements(card.id),
		queryKey: [...queryKeys.creditCardStatements.list(identity!, card.id), "browser"],
	});
	const visibleStatements = useMemo(
		() =>
			getStatementWindow(
				card,
				statements.data ?? [],
				currentMonth,
				radius + extra.previous,
				radius + extra.next,
			),
		[card, statements.data, currentMonth, radius, extra],
	);
	const firstMonth = getFirstNonZeroStatementMonth(statements.data ?? []) ?? currentMonth;
	const selectedStatement =
		visibleStatements.find(
			statement => getLocalMonthKey(statement.dueDate) === (selectedMonth ?? currentMonth),
		) ?? visibleStatements[0]!;
	const loadPrevious = useCallback(
		() => setExtra(value => ({ ...value, previous: value.previous + radius })),
		[radius],
	);
	const loadNext = useCallback(() => setExtra(value => ({ ...value, next: value.next + radius })), [radius]);
	const selectStatement = (id: string) => {
		const statement = visibleStatements.find(item => item.id === id);
		if (statement) setSelectedMonth(getLocalMonthKey(statement.dueDate));
	};

	if (statements.isPending) {
		return (
			<div className="grid min-h-0 grid-rows-[6.75rem_minmax(0,1fr)] gap-4 sm:grid-cols-[9rem_minmax(0,1fr)] sm:grid-rows-1 sm:gap-6">
				<div className="flex gap-2 overflow-hidden border-b pb-3 sm:grid sm:content-start sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0">
					{[1, 2, 3, 4].map(item => (
						<Skeleton className="h-20 w-36 shrink-0 sm:w-full" key={item} />
					))}
				</div>
				<Skeleton className="h-full" />
			</div>
		);
	}
	if (statements.isError) {
		return (
			<EmptyState
				description="Tente novamente em instantes."
				icon={<LuReceiptText className="size-7" />}
				title="Não foi possível carregar as faturas"
			/>
		);
	}
	return (
		<Tabs
			className="grid min-h-0 grid-rows-[6.75rem_minmax(0,1fr)] gap-0 sm:grid-cols-[9rem_minmax(0,1fr)] sm:grid-rows-1"
			onValueChange={selectStatement}
			orientation={isDesktop ? "vertical" : "horizontal"}
			value={selectedStatement.id}
		>
			<CreditCardStatementTabs
				canLoadPrevious={getLocalMonthKey(visibleStatements[0]!.dueDate) > firstMonth}
				ignoreBefore={ignoreBefore}
				isDesktop={isDesktop}
				onLoadNext={loadNext}
				onLoadPrevious={loadPrevious}
				onRadiusChange={setDesktopRadius}
				selectedId={selectedStatement.id}
				statements={visibleStatements}
			/>
			<CreditCardStatementDetails
				card={card}
				cutoffPending={cutoff.isPending}
				ignoreBefore={ignoreBefore}
				isEmptyCycle={selectedStatement.isEmptyCycle}
				key={selectedStatement.id}
				onSetIgnoreBefore={date => cutoff.mutate(date)}
				statement={selectedStatement}
			/>
		</Tabs>
	);
}
