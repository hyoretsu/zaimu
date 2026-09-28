import { useEffect, useLayoutEffect, useRef } from "react";
import { LuReceiptText } from "react-icons/lu";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { CreditCardStatement } from "@/lib/api";
import { formatLocalMonthYear } from "@/lib/date";
import { cn } from "@/lib/utils";
import { getCreditCardStatementStatus } from "./credit-card-statement-status";
import { getStatementWindowRadius } from "./credit-card-statement-window";

const currency = new Intl.NumberFormat("pt-BR", { currency: "BRL", style: "currency" });

export function CreditCardStatementTabs({
	canLoadPrevious,
	ignoreBefore,
	isDesktop,
	onLoadNext,
	onLoadPrevious,
	onRadiusChange,
	selectedId,
	statements,
}: {
	canLoadPrevious: boolean;
	ignoreBefore: string | null;
	isDesktop: boolean;
	onLoadNext: () => void;
	onLoadPrevious: () => void;
	onRadiusChange: (radius: number) => void;
	selectedId: string;
	statements: CreditCardStatement[];
}) {
	const scrollAreaRef = useRef<HTMLDivElement>(null);
	const pendingPrepend = useRef<{ size: number; offset: number } | null>(null);
	const centeredId = useRef<string | null>(null);
	const previousDesktop = useRef(isDesktop);

	useLayoutEffect(() => {
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		const activeTab = scrollAreaRef.current?.querySelector<HTMLElement>(
			'[data-slot="tabs-trigger"][data-state="active"]',
		);
		if (!viewport || !activeTab) return;
		const prepend = pendingPrepend.current;
		if (prepend) {
			if (isDesktop) viewport.scrollTop = prepend.offset + viewport.scrollHeight - prepend.size;
			else viewport.scrollLeft = prepend.offset + viewport.scrollWidth - prepend.size;
			pendingPrepend.current = null;
		} else if (centeredId.current === selectedId && previousDesktop.current === isDesktop) {
			return;
		}
		if (centeredId.current !== selectedId || previousDesktop.current !== isDesktop) {
			const viewportRect = viewport.getBoundingClientRect();
			const tabRect = activeTab.getBoundingClientRect();
			if (isDesktop)
				viewport.scrollTop += tabRect.top - viewportRect.top - (viewportRect.height - tabRect.height) / 2;
			else viewport.scrollLeft += tabRect.left - viewportRect.left - (viewportRect.width - tabRect.width) / 2;
			centeredId.current = selectedId;
			previousDesktop.current = isDesktop;
		}
	}, [isDesktop, selectedId, statements]);

	useEffect(() => {
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		const tab = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="tabs-trigger"]');
		if (!viewport || !tab) return;
		const resizeObserver = new ResizeObserver(() => {
			if (!isDesktop) return;
			onRadiusChange(
				getStatementWindowRadius(true, viewport.clientHeight, tab.getBoundingClientRect().height),
			);
		});
		resizeObserver.observe(viewport);
		resizeObserver.observe(tab);
		return () => resizeObserver.disconnect();
	}, [isDesktop, onRadiusChange]);

	useEffect(() => {
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="scroll-area-viewport"]');
		if (!viewport) return;
		let frame: number | null = null;
		const onScroll = () => {
			if (frame !== null) return;
			frame = requestAnimationFrame(() => {
				frame = null;
				const tab = scrollAreaRef.current?.querySelector<HTMLElement>('[data-slot="tabs-trigger"]');
				if (!tab || pendingPrepend.current) return;
				const offset = isDesktop ? viewport.scrollTop : viewport.scrollLeft;
				const size = isDesktop ? viewport.scrollHeight : viewport.scrollWidth;
				const visibleSize = isDesktop ? viewport.clientHeight : viewport.clientWidth;
				const threshold =
					(isDesktop ? tab.getBoundingClientRect().height : tab.getBoundingClientRect().width) + 8;
				if (canLoadPrevious && offset < threshold) {
					pendingPrepend.current = { offset, size };
					onLoadPrevious();
				} else if (size - visibleSize - offset < threshold) {
					onLoadNext();
				}
			});
		};
		viewport.addEventListener("scroll", onScroll, { passive: true });
		return () => {
			viewport.removeEventListener("scroll", onScroll);
			if (frame !== null) cancelAnimationFrame(frame);
		};
	}, [canLoadPrevious, isDesktop, onLoadNext, onLoadPrevious]);

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
						const status =
							ignoreBefore && statement.statementDate.slice(0, 10) < ignoreBefore
								? { className: "text-muted-foreground", icon: LuReceiptText, label: "Desconsiderada" }
								: getCreditCardStatementStatus(statement);
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
										{formatLocalMonthYear(statement.dueDate)}
										<span aria-label={status.label} className={status.className} role="img">
											<StatusIcon aria-hidden="true" className="size-4" />
										</span>
									</span>
									<strong className="truncate text-sm">
										{currency.format(statement.amountDue ?? statement.totalAmount)}
									</strong>
								</span>
							</TabsTrigger>
						);
					})}
				</TabsList>
			</ScrollArea>
		</div>
	);
}
