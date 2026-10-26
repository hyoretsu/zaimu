import { Popover as PopoverPrimitive } from "radix-ui";
import { type ComponentProps, useContext } from "react";
import { usePopoverPlacement } from "@/hooks/use-popover-placement";
import { usePopupViewportShift } from "@/hooks/use-popup-viewport-shift";
import { useRouteDismissableOpen } from "@/hooks/use-route-dismissable-open";
import { cn } from "@/lib/utils";
import { PopupLayerContext } from "./popup-layer-context";

function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
	const openProps = useRouteDismissableOpen(props);
	return <PopoverPrimitive.Root data-slot="popover" {...props} {...openProps} />;
}

function PopoverTrigger(props: ComponentProps<typeof PopoverPrimitive.Trigger>) {
	return <PopoverPrimitive.Trigger data-slot="popover-trigger" {...props} />;
}

function PopoverContent({
	className,
	align = "center",
	portal = true,
	sideOffset = 4,
	sticky = "always",
	side = "bottom",
	ref,
	style,
	...props
}: ComponentProps<typeof PopoverPrimitive.Content> & { portal?: boolean }) {
	const zIndex = useContext(PopupLayerContext) + 1;
	const constrained = style?.maxHeight !== undefined || /(?:^|\s)(?:\S+:)?max-h-/.test(className ?? "");
	const popupRef = usePopupViewportShift();
	const placement = usePopoverPlacement(side, sideOffset);
	const content = (
		<PopoverPrimitive.Content
			align={align}
			className={cn(
				"scrollbar-themed data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 bg-popover text-popover-foreground ring-foreground/5 data-open:animate-in pointer-events-auto z-50 flex max-h-[min(var(--popup-viewport-height),var(--popover-side-height,var(--popup-viewport-height)))] w-72 max-w-[min(calc(100vw-2rem),var(--radix-popover-content-available-width))] origin-(--radix-popover-content-transform-origin) flex-col gap-4 overflow-x-hidden overflow-y-auto rounded-2xl p-4 text-sm shadow-2xl ring-1 outline-hidden duration-100 data-closed:animate-none",
				constrained && "max-h-(--radix-popover-content-available-height)",
				className,
			)}
			collisionPadding={16}
			data-slot="popover-content"
			ref={node => {
				popupRef(node);
				placement.ref(node);
				if (typeof ref === "function") return ref(node);
				if (ref) ref.current = node;
			}}
			side={placement.side}
			sideOffset={sideOffset}
			sticky={sticky}
			style={{
				zIndex,
				...style,
				maxHeight: "min(var(--popup-viewport-height,100dvh), var(--popup-max-height,100dvh))",
			}}
			{...props}
		/>
	);

	const layeredContent = (
		<PopupLayerContext.Provider value={Number(style?.zIndex ?? zIndex)}>
			{content}
		</PopupLayerContext.Provider>
	);
	return portal ? <PopoverPrimitive.Portal>{layeredContent}</PopoverPrimitive.Portal> : layeredContent;
}

function PopoverAnchor(props: ComponentProps<typeof PopoverPrimitive.Anchor>) {
	return <PopoverPrimitive.Anchor data-slot="popover-anchor" {...props} />;
}

function PopoverHeader({ className, ...props }: ComponentProps<"div">) {
	return (
		<div className={cn("flex flex-col gap-1 text-sm", className)} data-slot="popover-header" {...props} />
	);
}

function PopoverTitle({ className, ...props }: ComponentProps<"h2">) {
	return <h2 className={cn("text-base font-medium", className)} data-slot="popover-title" {...props} />;
}

function PopoverDescription({ className, ...props }: ComponentProps<"p">) {
	return (
		<p className={cn("text-muted-foreground", className)} data-slot="popover-description" {...props} />
	);
}

export {
	Popover,
	PopoverAnchor,
	PopoverContent,
	PopoverDescription,
	PopoverHeader,
	PopoverTitle,
	PopoverTrigger,
};
