import { ArrowDown01Icon, ArrowUp01Icon, Tick02Icon, UnfoldMoreIcon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Select as SelectPrimitive } from "radix-ui";
import type { ComponentProps, ReactNode } from "react";
import { usePopupViewportShift } from "@/hooks/use-popup-viewport-shift";
import { useRouteDismissableOpen } from "@/hooks/use-route-dismissable-open";
import { cn } from "@/lib/utils";

function Select({ ...props }: ComponentProps<typeof SelectPrimitive.Root>) {
	const openProps = useRouteDismissableOpen(props);
	return <SelectPrimitive.Root data-slot="select" {...props} {...openProps} />;
}

function SelectGroup({ className, ...props }: ComponentProps<typeof SelectPrimitive.Group>) {
	return (
		<SelectPrimitive.Group className={cn("scroll-my-1 p-1", className)} data-slot="select-group" {...props} />
	);
}

function SelectValue({ ...props }: ComponentProps<typeof SelectPrimitive.Value>) {
	return <SelectPrimitive.Value data-slot="select-value" {...props} />;
}

function SelectTrigger({
	className,
	size = "default",
	children,
	...props
}: ComponentProps<typeof SelectPrimitive.Trigger> & {
	size?: "sm" | "default";
}) {
	return (
		<SelectPrimitive.Trigger
			className={cn(
				"flex w-fit min-w-0 items-center justify-between gap-1.5 whitespace-nowrap rounded-4xl border border-input bg-input/30 px-3 py-2 text-left text-sm outline-none transition-colors focus-visible:border-ring focus-visible:ring-[3px] focus-visible:ring-ring/50 disabled:cursor-not-allowed disabled:opacity-50 aria-invalid:border-destructive aria-invalid:ring-[3px] aria-invalid:ring-destructive/20 data-[size=default]:h-9 data-[size=sm]:h-8 data-placeholder:text-muted-foreground dark:aria-invalid:border-destructive/50 dark:aria-invalid:ring-destructive/40 dark:hover:bg-input/50 [&>[data-slot=select-value]]:min-w-0 [&>[data-slot=select-value]]:flex-1 [&>[data-slot=select-value]]:items-center [&>[data-slot=select-value]]:gap-1.5 [&>[data-slot=select-value]]:truncate [&>[data-slot=select-value]]:text-left [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0",
				className,
			)}
			data-size={size}
			data-slot="select-trigger"
			{...props}
		>
			{children}
			<SelectPrimitive.Icon asChild>
				<HugeiconsIcon
					className="pointer-events-none size-4 text-muted-foreground"
					icon={UnfoldMoreIcon}
					strokeWidth={2}
				/>
			</SelectPrimitive.Icon>
		</SelectPrimitive.Trigger>
	);
}

function SelectContent({
	className,
	children,
	header,
	position = "item-aligned",
	scrollButtons = true,
	align = "center",
	sticky = "always",
	ref,
	style,
	viewportClassName,
	...props
}: ComponentProps<typeof SelectPrimitive.Content> & {
	header?: ReactNode;
	scrollButtons?: boolean;
	viewportClassName?: string;
}) {
	const constrained = style?.maxHeight !== undefined || /(?:^|\s)(?:\S+:)?max-h-/.test(className ?? "");
	const popupRef = usePopupViewportShift(!constrained, position === "item-aligned");
	return (
		<SelectPrimitive.Portal>
			<SelectPrimitive.Content
				align={align}
				className={cn(
					"scrollbar-themed data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 relative z-50 max-h-(--popup-viewport-height) min-w-36 max-w-[calc(100vw-2rem)] origin-(--radix-select-content-transform-origin) rounded-2xl bg-popover text-popover-foreground shadow-2xl ring-1 ring-foreground/5 duration-100 data-[align-trigger=true]:animate-none data-closed:animate-out data-open:animate-in",
					header ? "overflow-hidden" : "overflow-y-auto overflow-x-hidden",
					position === "popper" &&
						"data-[side=left]:-translate-x-1 data-[side=right]:translate-x-1 data-[side=bottom]:translate-y-1 data-[side=top]:-translate-y-1",
					constrained && "max-h-(--radix-select-content-available-height)",
					className,
				)}
				collisionPadding={16}
				data-align-trigger={position === "item-aligned"}
				data-slot="select-content"
				position={position}
				ref={node => {
					popupRef(node);
					if (typeof ref === "function") return ref(node);
					if (ref) ref.current = node;
				}}
				sticky={sticky}
				style={style}
				{...props}
			>
				{scrollButtons && <SelectScrollUpButton />}
				{header}
				<SelectPrimitive.Viewport
					className={cn(
						"data-[position=popper]:h-(--radix-select-trigger-height) data-[position=popper]:w-full data-[position=popper]:min-w-(--radix-select-trigger-width)",
						position === "popper" && "",
						viewportClassName,
					)}
					data-position={position}
				>
					{children}
				</SelectPrimitive.Viewport>
				{scrollButtons && <SelectScrollDownButton />}
			</SelectPrimitive.Content>
		</SelectPrimitive.Portal>
	);
}

function SelectLabel({ className, ...props }: ComponentProps<typeof SelectPrimitive.Label>) {
	return (
		<SelectPrimitive.Label
			className={cn("px-3 py-2.5 text-muted-foreground text-xs", className)}
			data-slot="select-label"
			{...props}
		/>
	);
}

function SelectItem({ className, children, ...props }: ComponentProps<typeof SelectPrimitive.Item>) {
	return (
		<SelectPrimitive.Item
			className={cn(
				"relative flex w-full cursor-default select-none items-center gap-2.5 rounded-xl py-2 pr-8 pl-3 text-sm outline-hidden focus:bg-accent focus:text-accent-foreground not-data-[variant=destructive]:focus:**:text-accent-foreground data-disabled:pointer-events-none data-disabled:opacity-50 [&_svg:not([class*='size-'])]:size-4 [&_svg]:pointer-events-none [&_svg]:shrink-0 *:[span]:last:flex *:[span]:last:items-center *:[span]:last:gap-2",
				className,
			)}
			data-slot="select-item"
			{...props}
		>
			<span className="pointer-events-none absolute right-2 flex size-4 items-center justify-center">
				<SelectPrimitive.ItemIndicator>
					<HugeiconsIcon className="pointer-events-none" icon={Tick02Icon} strokeWidth={2} />
				</SelectPrimitive.ItemIndicator>
			</span>
			<SelectPrimitive.ItemText>{children}</SelectPrimitive.ItemText>
		</SelectPrimitive.Item>
	);
}

function SelectSeparator({ className, ...props }: ComponentProps<typeof SelectPrimitive.Separator>) {
	return (
		<SelectPrimitive.Separator
			className={cn("pointer-events-none -mx-1 my-1 h-px bg-border/50", className)}
			data-slot="select-separator"
			{...props}
		/>
	);
}

function SelectScrollUpButton({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.ScrollUpButton>) {
	return (
		<SelectPrimitive.ScrollUpButton
			className={cn(
				"z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			data-slot="select-scroll-up-button"
			{...props}
		>
			<HugeiconsIcon icon={ArrowUp01Icon} strokeWidth={2} />
		</SelectPrimitive.ScrollUpButton>
	);
}

function SelectScrollDownButton({
	className,
	...props
}: ComponentProps<typeof SelectPrimitive.ScrollDownButton>) {
	return (
		<SelectPrimitive.ScrollDownButton
			className={cn(
				"z-10 flex cursor-default items-center justify-center bg-popover py-1 [&_svg:not([class*='size-'])]:size-4",
				className,
			)}
			data-slot="select-scroll-down-button"
			{...props}
		>
			<HugeiconsIcon icon={ArrowDown01Icon} strokeWidth={2} />
		</SelectPrimitive.ScrollDownButton>
	);
}

export {
	Select,
	SelectContent,
	SelectGroup,
	SelectItem,
	SelectLabel,
	SelectScrollDownButton,
	SelectScrollUpButton,
	SelectSeparator,
	SelectTrigger,
	SelectValue,
};
