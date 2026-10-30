import { Tooltip as TooltipPrimitive } from "radix-ui";
import { type ComponentProps, createContext, use } from "react";
import { useRouteDismissableOpen } from "@/hooks/use-route-dismissable-open";
import { cn } from "@/lib/utils";

const TooltipTriggerContext = createContext(false);

/** True when rendered inside a `TooltipTrigger`, so nested buttons skip their automatic tooltip. */
function useInsideTooltipTrigger() {
	return use(TooltipTriggerContext);
}

function TooltipProvider({ delayDuration = 0, ...props }: ComponentProps<typeof TooltipPrimitive.Provider>) {
	return (
		<TooltipPrimitive.Provider data-slot="tooltip-provider" delayDuration={delayDuration} {...props} />
	);
}

function Tooltip({ ...props }: ComponentProps<typeof TooltipPrimitive.Root>) {
	const openProps = useRouteDismissableOpen(props);
	return <TooltipPrimitive.Root data-slot="tooltip" {...props} {...openProps} />;
}

function TooltipTrigger({ ...props }: ComponentProps<typeof TooltipPrimitive.Trigger>) {
	return (
		<TooltipTriggerContext value>
			<TooltipPrimitive.Trigger data-slot="tooltip-trigger" {...props} />
		</TooltipTriggerContext>
	);
}

function TooltipContent({
	className,
	sideOffset = 0,
	sticky = "always",
	children,
	...props
}: ComponentProps<typeof TooltipPrimitive.Content>) {
	return (
		<TooltipPrimitive.Portal>
			<TooltipPrimitive.Content
				className={cn(
					"data-[side=bottom]:slide-in-from-top-2 data-[side=left]:slide-in-from-right-2 data-[side=right]:slide-in-from-left-2 data-[side=top]:slide-in-from-bottom-2 data-[state=delayed-open]:fade-in-0 data-[state=delayed-open]:zoom-in-95 data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 bg-foreground text-background data-[state=delayed-open]:animate-in data-open:animate-in z-50 inline-flex w-fit max-w-[min(20rem,calc(100vw-2rem))] origin-(--radix-tooltip-content-transform-origin) items-center gap-1.5 rounded-2xl px-3 py-1.5 text-xs wrap-anywhere has-data-[slot=kbd]:pr-1.5 data-closed:animate-none **:data-[slot=kbd]:relative **:data-[slot=kbd]:isolate **:data-[slot=kbd]:z-50 **:data-[slot=kbd]:rounded-4xl",
					className,
				)}
				collisionPadding={16}
				data-slot="tooltip-content"
				sideOffset={sideOffset}
				sticky={sticky}
				{...props}
			>
				{children}
				<TooltipPrimitive.Arrow className="bg-foreground fill-foreground z-50 size-2.5 translate-y-[calc(-50%_-_2px)] rotate-45 rounded-[2px] data-[side=left]:translate-x-[-1.5px] data-[side=right]:translate-x-[1.5px]" />
			</TooltipPrimitive.Content>
		</TooltipPrimitive.Portal>
	);
}

export { Tooltip, TooltipContent, TooltipProvider, TooltipTrigger, useInsideTooltipTrigger };
