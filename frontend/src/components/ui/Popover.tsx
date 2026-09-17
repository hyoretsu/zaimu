import { Popover as PopoverPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { cn } from "@/lib/utils";

function Popover(props: ComponentProps<typeof PopoverPrimitive.Root>) {
	return <PopoverPrimitive.Root data-slot="popover" {...props} />;
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
	...props
}: ComponentProps<typeof PopoverPrimitive.Content> & { portal?: boolean }) {
	const content = (
		<PopoverPrimitive.Content
			align={align}
			className={cn(
				"scrollbar-themed data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-closed:fade-out-0 data-closed:zoom-out-95 data-open:fade-in-0 data-open:zoom-in-95 pointer-events-auto z-50 flex max-h-[min(calc(100dvh-2rem),var(--radix-popover-content-available-height))] w-72 max-w-[min(calc(100vw-2rem),var(--radix-popover-content-available-width))] origin-(--radix-popover-content-transform-origin) flex-col gap-4 overflow-y-auto overflow-x-hidden rounded-2xl bg-popover p-4 text-popover-foreground text-sm shadow-2xl outline-hidden ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in",
				className,
			)}
			collisionPadding={16}
			data-slot="popover-content"
			sideOffset={sideOffset}
			sticky={sticky}
			{...props}
		/>
	);

	return portal ? <PopoverPrimitive.Portal>{content}</PopoverPrimitive.Portal> : content;
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
	return <h2 className={cn("font-medium text-base", className)} data-slot="popover-title" {...props} />;
}

function PopoverDescription({ className, ...props }: ComponentProps<"p">) {
	return <p className={cn("text-muted-foreground", className)} data-slot="popover-description" {...props} />;
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
