import { useLayoutEffect, useRef } from "react";
import { LuCircleCheck, LuClock3, LuLockKeyhole, LuTriangleAlert } from "react-icons/lu";
import { Button } from "@/components/ui/Button";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { CreditCardStatement } from "@/lib/api";
import { formatLocalMonthYear, getLocalDateKey } from "@/lib/date";
import { cn } from "@/lib/utils";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

function getStatementStatus(statement: CreditCardStatement) {
	if (statement.isForecast) return { className: "text-muted-foreground", icon: LuClock3, label: "Futura" };
	if (statement.isPaid) return { className: "text-amber-500", icon: LuLockKeyhole, label: "Fechada" };
	if (statement.dueDate.slice(0, 10) < getLocalDateKey()) {
		return { className: "text-destructive", icon: LuTriangleAlert, label: "Em atraso" };
	}

	return { className: "text-foreground", icon: LuCircleCheck, label: "Em aberto" };
}

export function CreditCardStatementTabs({
	hasMore,
	isLoadingMore,
	onLoadMore,
	selectedId,
	statements,
}: {
	hasMore: boolean;
	isLoadingMore: boolean;
	onLoadMore: () => void;
	selectedId: string;
	statements: CreditCardStatement[];
}) {
	const scrollAreaRef = useRef<HTMLDivElement>(null);

	useLayoutEffect(() => {
		const scrollArea = scrollAreaRef.current;
		const viewport = scrollArea?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		const activeTab = scrollArea?.querySelector<HTMLElement>(
			'[data-slot="tabs-trigger"][data-state="active"]',
		);

		if (!viewport || !activeTab) return;

		const viewportRect = viewport.getBoundingClientRect();
		const activeTabRect = activeTab.getBoundingClientRect();
		if (viewport.scrollHeight > viewport.clientHeight) {
			const targetTop =
				viewport.scrollTop +
				activeTabRect.top -
				viewportRect.top -
				(viewportRect.height - activeTabRect.height) / 2;

			viewport.scrollTo({ behavior: "auto", top: Math.max(0, targetTop) });
			return;
		}

		if (viewport.scrollWidth > viewport.clientWidth) {
			const targetLeft =
				viewport.scrollLeft +
				activeTabRect.left -
				viewportRect.left -
				(viewportRect.width - activeTabRect.width) / 2;

			viewport.scrollTo({ behavior: "auto", left: Math.max(0, targetLeft) });
		}
	}, [selectedId]);

	return (
		<div className="h-full min-w-0" ref={scrollAreaRef}>
			<ScrollArea
				className="h-full border-b px-1 pb-3 sm:border-r sm:border-b-0 sm:pr-3 sm:pb-0"
				horizontalScrollbar
			>
				<TabsList
					aria-label="Faturas"
					className="!flex-row sm:!grid sm:!h-auto sm:!w-full sm:!grid-cols-1 h-full w-max min-w-full gap-2 bg-transparent py-1 pr-1 pl-0"
				>
					{statements.map(statement => {
						const selected = statement.id === selectedId;
						const status = getStatementStatus(statement);
						const StatusIcon = status.icon;
						return (
							<TabsTrigger
								className={cn(
									"sm:!w-full h-full w-36 shrink-0 cursor-pointer items-start justify-start whitespace-normal rounded-xl border-border p-3 text-left sm:h-auto",
									selected && "border-primary bg-primary/10 ring-1 ring-primary/30",
								)}
								key={statement.id}
								value={statement.id}
							>
								<span className="grid min-w-0 flex-1 gap-1.5">
									<span className="flex items-center gap-1.5 font-semibold text-sm">
										{formatLocalMonthYear(statement.statementDate)}
										<span aria-label={status.label} className={status.className} role="img">
											<StatusIcon aria-hidden="true" className="size-4" />
										</span>
									</span>
									<strong className="truncate text-sm">{currency.format(statement.balanceAmount)}</strong>
								</span>
							</TabsTrigger>
						);
					})}
					{hasMore && (
						<Button
							className="h-full w-36 shrink-0 cursor-pointer disabled:cursor-not-allowed sm:h-10 sm:w-full"
							disabled={isLoadingMore}
							onClick={onLoadMore}
							variant="outline"
						>
							{isLoadingMore ? "Carregando…" : "Carregar mais"}
						</Button>
					)}
				</TabsList>
			</ScrollArea>
		</div>
	);
}
