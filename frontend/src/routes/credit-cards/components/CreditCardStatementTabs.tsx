import { useEffect, useLayoutEffect, useRef } from "react";
import { LuCloudDownload, LuReceiptText } from "react-icons/lu";
import { PreferredMoneyAmount } from "@/components/currency/PreferredMoneyAmount";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { TabsList, TabsTrigger } from "@/components/ui/Tabs";
import type { CreditCardStatement } from "@/lib/api";
import { getCreditCardStatementInvoiceAmount } from "@/lib/credit-card-statement-balance";
import { statementLabel } from "@/lib/statement-label";
import { cn } from "@/lib/utils";
import { getCreditCardStatementStatus } from "./credit-card-statement-status";
import { getStatementWindowRadius } from "./credit-card-statement-window";

export function CreditCardStatementTabs({
	currencyCode,
	canLoadPrevious,
	ignoreBefore,
	isDesktop,
	onLoadNext,
	onLoadPrevious,
	onRadiusChange,
	selectedId,
	statements,
}: {
	currencyCode: string;
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
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		);
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
				viewport.scrollTop +=
					tabRect.top - viewportRect.top - (viewportRect.height - tabRect.height) / 2;
			else
				viewport.scrollLeft +=
					tabRect.left - viewportRect.left - (viewportRect.width - tabRect.width) / 2;
			centeredId.current = selectedId;
			previousDesktop.current = isDesktop;
		}
	}, [isDesktop, selectedId, statements]);

	useEffect(() => {
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		);
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
		const viewport = scrollAreaRef.current?.querySelector<HTMLElement>(
			'[data-slot="scroll-area-viewport"]',
		);
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
			<ScrollArea className="h-full min-h-0 border-b" horizontalScrollbar>
				<TabsList
					aria-label="Faturas"
					className="!h-auto w-max min-w-full !flex-row gap-2 bg-transparent px-1 pt-1 pb-4"
				>
					{statements.map(statement => {
						const selected = statement.id === selectedId;
						const status =
							ignoreBefore && statement.statementDate.slice(0, 10) < ignoreBefore
								? {
										className: "text-muted-foreground",
										icon: LuReceiptText,
										label: "Desconsiderada",
									}
								: getCreditCardStatementStatus(statement);
						const StatusIcon = status.icon;
						return (
							<TabsTrigger
								aria-label={`${statementLabel(statement, statements)}${status.label ? ` - ${status.label}` : ""}`}
								className={cn(
									"border-border h-24 w-40 shrink-0 cursor-pointer items-start justify-start rounded-xl p-3 text-left whitespace-normal",
									selected && "border-primary bg-primary/10 ring-primary/30 ring-1",
								)}
								key={statement.id}
								value={statement.id}
							>
								<span className="grid min-w-0 flex-1 gap-1.5">
									<span className="flex items-center gap-1.5 text-sm font-semibold">
										{statementLabel(statement, statements)}
										{StatusIcon && (
											<span
												aria-label={status.label}
												className={status.className}
												role="img"
											>
												<StatusIcon aria-hidden="true" className="size-4" />
											</span>
										)}
									</span>
									<span className="flex min-w-0 items-center gap-1.5">
										<strong className="truncate text-sm">
											{
												<PreferredMoneyAmount
													values={[
														{
															amount: getCreditCardStatementInvoiceAmount(
																statement,
															),
															currency: currencyCode,
														},
													]}
												/>
											}
										</strong>
										{statement.isFullySynced && (
											<span
												aria-label="Sincronizada"
												className="shrink-0 text-emerald-600"
												role="img"
											>
												<LuCloudDownload aria-hidden="true" className="size-4" />
											</span>
										)}
									</span>
									{statement.actualInvoiceAmount != null &&
										statement.invoiceAmount != null &&
										Math.abs(statement.invoiceAmount - statement.actualInvoiceAmount) >
											0.001 && (
											<span className="text-muted-foreground text-xs">
												Previsão:{" "}
												<PreferredMoneyAmount
													values={[
														{
															amount: statement.invoiceAmount,
															currency: currencyCode,
														},
													]}
												/>
											</span>
										)}
								</span>
							</TabsTrigger>
						);
					})}
				</TabsList>
			</ScrollArea>
		</div>
	);
}
