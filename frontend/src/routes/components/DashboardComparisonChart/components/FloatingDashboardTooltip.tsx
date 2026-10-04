import { type RefObject, useLayoutEffect, useRef, useState } from "react";
import { createPortal } from "react-dom";
import { ScrollArea } from "@/components/ui/ScrollArea";
import type { DashboardPeriod } from "@/lib/api";
import { DashboardChartTooltip } from "./DashboardChartTooltip";
import type { DashboardChartKind } from "./types";

interface FloatingDashboardTooltipProps {
	active?: boolean;
	kind?: DashboardChartKind;
	chartRef: RefObject<HTMLDivElement | null>;
	coordinate?: { x?: number; y?: number };
	period?: DashboardPeriod;
}

export function FloatingDashboardTooltip({
	active,
	chartRef,
	coordinate,
	kind,
	period,
}: FloatingDashboardTooltipProps) {
	const ref = useRef<HTMLDivElement>(null);
	const [position, setPosition] = useState({ left: 0, top: 0 });
	useLayoutEffect(() => {
		if (!active || !period) return;
		const update = () => {
			const chart = chartRef.current?.getBoundingClientRect();
			const tooltip = ref.current?.getBoundingClientRect();
			if (!chart || !tooltip) return;
			const gap = 12,
				edge = 8;
			const x = chart.left + (coordinate?.x ?? chart.width / 2);
			const y = chart.top + (coordinate?.y ?? 0);
			const left = x + gap + tooltip.width <= window.innerWidth - edge ? x + gap : x - tooltip.width - gap;
			const top = y + gap + tooltip.height <= window.innerHeight - edge ? y + gap : y - tooltip.height - gap;
			setPosition({
				left: Math.max(edge, Math.min(left, window.innerWidth - tooltip.width - edge)),
				top: Math.max(edge, Math.min(top, window.innerHeight - tooltip.height - edge)),
			});
		};
		update();
		const observer = new ResizeObserver(update);
		if (ref.current) observer.observe(ref.current);
		window.addEventListener("resize", update);
		window.addEventListener("scroll", update, true);
		return () => {
			observer.disconnect();
			window.removeEventListener("resize", update);
			window.removeEventListener("scroll", update, true);
		};
	}, [active, chartRef, coordinate?.x, coordinate?.y, period]);
	if (!active || !period || typeof document === "undefined") return null;
	return createPortal(
		<div className="pointer-events-none fixed z-50" ref={ref} style={position}>
			<ScrollArea className="max-h-[calc(100dvh-1rem)] min-h-0 rounded-lg">
				<DashboardChartTooltip active kind={kind} period={period} />
			</ScrollArea>
		</div>,
		document.body,
	);
}
