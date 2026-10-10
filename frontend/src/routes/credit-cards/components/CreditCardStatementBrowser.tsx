import { useQuery } from "@tanstack/react-query";
import { useCallback, useMemo, useState } from "react";
import { LuReceiptText } from "react-icons/lu";
import { DialogBody, DialogDescription, DialogHeader, DialogTitle } from "@/components/ui/Dialog";
import { EmptyState } from "@/components/ui/EmptyState";
import { Skeleton } from "@/components/ui/Skeleton";
import { Tabs } from "@/components/ui/Tabs";
import { useMediaQuery } from "@/hooks/use-media-query";
import type { CreditCard } from "@/lib/api";
import { dataService } from "@/lib/dataService";
import { getLocalMonthKey } from "@/lib/date";
import { queryKeys, useCacheIdentity } from "@/lib/query-cache";
import { CreditCardStatementDetails } from "./CreditCardStatementDetails";
import { CreditCardStatementSkeleton } from "./CreditCardStatementSkeleton";
import { CreditCardStatementTabs } from "./CreditCardStatementTabs";
import { getFirstNonZeroStatementMonth, getStatementWindow } from "./credit-card-statement-window";

export function CreditCardStatementBrowser({
	card,
	onAddPurchase,
}: {
	card: CreditCard;
	onAddPurchase: () => void;
}) {
	const identity = useCacheIdentity();
	const ignoreBefore = card.ignoreStatementsBefore?.slice(0, 10) ?? null;
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
		) ?? visibleStatements[0];
	const loadPrevious = useCallback(
		() => setExtra(value => ({ ...value, previous: value.previous + radius })),
		[radius],
	);
	const loadNext = useCallback(() => setExtra(value => ({ ...value, next: value.next + radius })), [radius]);
	const selectStatement = (id: string) => {
		const statement = visibleStatements.find(item => item.id === id);
		if (statement) setSelectedMonth(getLocalMonthKey(statement.dueDate));
	};

	return (
		<Tabs
			className="min-h-0 min-w-0 flex-1 gap-4 sm:gap-6"
			onValueChange={selectStatement}
			orientation="horizontal"
			value={selectedStatement?.id}
		>
			<div className="min-w-0 shrink-0 space-y-2">
				<DialogHeader>
					<DialogTitle>Faturas de {card.accountName ?? "Cartão de crédito"}</DialogTitle>
					<DialogDescription>Selecione um mês para consultar os detalhes e as transações.</DialogDescription>
				</DialogHeader>
				{statements.isPending ? (
					<div className="h-[6.75rem] min-h-0 min-w-0 pt-2 pr-3">
						<div className="h-full overflow-hidden border-b">
							<div className="flex w-max gap-2 px-1 pt-1 pb-3">
								{[1, 2, 3, 4, 5, 6, 7].map(item => (
									<Skeleton className="h-20 w-36 shrink-0 rounded-xl" key={item} />
								))}
							</div>
						</div>
					</div>
				) : !statements.isError && selectedStatement ? (
					<div className="h-[6.75rem] min-h-0 min-w-0 pt-2 pr-3">
						<CreditCardStatementTabs
							canLoadPrevious={getLocalMonthKey(visibleStatements[0]!.dueDate) > firstMonth}
							currencyCode={card.currency ?? "BRL"}
							ignoreBefore={ignoreBefore}
							isDesktop={false}
							onLoadNext={loadNext}
							onLoadPrevious={loadPrevious}
							onRadiusChange={setDesktopRadius}
							selectedId={selectedStatement.id}
							statements={visibleStatements}
						/>
					</div>
				) : null}
			</div>
			{statements.isPending ? (
				<div className="relative flex min-h-0 min-w-0 flex-1 flex-col overflow-hidden">
					<DialogBody className="flex-1">
						<CreditCardStatementSkeleton />
					</DialogBody>
				</div>
			) : statements.isError ? (
				<DialogBody>
					<EmptyState
						description="Tente novamente em instantes."
						icon={<LuReceiptText className="size-7" />}
						title="Não foi possível carregar as faturas"
					/>
				</DialogBody>
			) : selectedStatement ? (
				<CreditCardStatementDetails
					card={card}
					ignoreBefore={ignoreBefore}
					isEmptyCycle={selectedStatement.isEmptyCycle}
					key={selectedStatement.id}
					onAddPurchase={onAddPurchase}
					statement={selectedStatement}
				/>
			) : (
				<DialogBody>
					<EmptyState
						description="Faturas com total zero não são exibidas."
						icon={<LuReceiptText className="size-7" />}
						title="Nenhuma fatura disponível"
					/>
				</DialogBody>
			)}
		</Tabs>
	);
}
