import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import { type ComponentProps, createContext, useContext } from "react";
import { Button } from "@/components/ui/Button";
import { DialogBody } from "@/components/ui/DialogBody";
import { useDialogHistory } from "@/hooks/use-dialog-history";
import { useRouteDismissableOpen } from "@/hooks/use-route-dismissable-open";
import { useScrollBoundary } from "@/hooks/use-scroll-boundary";
import type { DialogUrl } from "@/lib/dialog-url";
import { cn } from "@/lib/utils";
import { PopupLayerContext } from "./popup-layer-context";

const DialogStackContext = createContext<{
	depth: number;
	dismissTopmost: () => boolean;
	isTopmost: () => boolean;
}>({ depth: 0, dismissTopmost: () => false, isTopmost: () => true });
const DialogContentContext = createContext({ showCloseButton: true });

function Dialog({
	modal = false,
	url,
	...props
}: ComponentProps<typeof DialogPrimitive.Root> & { url?: DialogUrl }) {
	const openProps = useRouteDismissableOpen(props);
	const stack = useDialogHistory(openProps.open, openProps.onOpenChange, url);
	return (
		<DialogStackContext.Provider value={stack}>
			<DialogPrimitive.Root data-slot="dialog" modal={modal} {...props} {...openProps} />
		</DialogStackContext.Provider>
	);
}

function DialogTrigger({ ...props }: ComponentProps<typeof DialogPrimitive.Trigger>) {
	return <DialogPrimitive.Trigger data-slot="dialog-trigger" {...props} />;
}

function DialogPortal({ ...props }: ComponentProps<typeof DialogPrimitive.Portal>) {
	return <DialogPrimitive.Portal data-slot="dialog-portal" {...props} />;
}

function DialogClose({ ...props }: ComponentProps<typeof DialogPrimitive.Close>) {
	return <DialogPrimitive.Close data-slot="dialog-close" {...props} />;
}

function DialogOverlay({ className, style, ref, ...props }: ComponentProps<"div">) {
	const boundaryRef = useScrollBoundary(ref);
	const { depth } = useContext(DialogStackContext);

	return (
		<div
			className={cn(
				"data-open:fade-in-0 data-closed:fade-out-0 data-open:animate-in fixed inset-0 isolate z-50 touch-none bg-black/80 duration-100 data-closed:animate-none supports-backdrop-filter:backdrop-blur-xs",
				className,
			)}
			data-slot="dialog-overlay"
			ref={boundaryRef}
			style={{ zIndex: 50 + depth * 2, ...style }}
			{...props}
		/>
	);
}

function DialogContent({
	className,
	children,
	overlayClassName,
	showCloseButton = true,
	onEscapeKeyDown,
	onInteractOutside,
	onOpenAutoFocus,
	onFocusOutside,
	ref,
	style,
	...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
	overlayClassName?: string;
	showCloseButton?: boolean;
}) {
	const { depth, dismissTopmost, isTopmost } = useContext(DialogStackContext);
	const boundaryRef = useScrollBoundary(ref);
	return (
		<DialogPortal>
			<DialogOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				className={cn(
					"data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 bg-popover text-popover-foreground ring-foreground/5 data-open:animate-in fixed top-(--visible-viewport-center,50%) left-1/2 z-50 flex max-h-[calc(var(--visible-viewport-height,100dvh)-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 flex-col gap-6 overflow-hidden rounded-4xl p-6 text-sm ring-1 duration-100 outline-none data-closed:animate-none sm:max-w-md [&:has([data-slot=dialog-header])>[data-slot=dialog-close]]:hidden",
					className,
				)}
				data-slot="dialog-content"
				ref={boundaryRef}
				style={{ zIndex: 51 + depth * 2, ...style }}
				{...props}
				onEscapeKeyDown={event => {
					onEscapeKeyDown?.(event);
					if (!event.defaultPrevented && dismissTopmost()) event.preventDefault();
				}}
				onFocusOutside={event => {
					event.preventDefault();
					onFocusOutside?.(event);
				}}
				onInteractOutside={event => {
					if (!isTopmost()) event.preventDefault();
					onInteractOutside?.(event);
				}}
				onOpenAutoFocus={event => {
					if (!isTopmost()) event.preventDefault();
					onOpenAutoFocus?.(event);
				}}
			>
				<PopupLayerContext.Provider value={Number(style?.zIndex ?? 51 + depth * 2)}>
					<DialogContentContext.Provider value={{ showCloseButton }}>
						{children}
					</DialogContentContext.Provider>
				</PopupLayerContext.Provider>
				{showCloseButton && (
					<DialogPrimitive.Close asChild data-slot="dialog-close">
						<Button
							className="absolute top-4 right-4 cursor-pointer"
							size="icon-sm"
							variant="outline"
						>
							<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
							<span className="sr-only">Fechar</span>
						</Button>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogHeader({ className, children, ...props }: ComponentProps<"div">) {
	const { showCloseButton } = useContext(DialogContentContext);

	return (
		<div
			className={cn("flex min-w-0 shrink-0 items-start justify-between gap-4", className)}
			data-slot="dialog-header"
			{...props}
		>
			<div className="flex min-w-0 flex-1 flex-col gap-2 wrap-anywhere">{children}</div>
			{showCloseButton && (
				<DialogPrimitive.Close asChild data-slot="dialog-close">
					<Button className="shrink-0 cursor-pointer" size="icon-sm" variant="outline">
						<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
						<span className="sr-only">Fechar</span>
					</Button>
				</DialogPrimitive.Close>
			)}
		</div>
	);
}

function DialogFooter({
	className,
	showCloseButton = false,
	children,
	...props
}: ComponentProps<"div"> & {
	showCloseButton?: boolean;
}) {
	return (
		<div
			className={cn("flex shrink-0 flex-wrap items-center justify-end gap-2", className)}
			data-slot="dialog-footer"
			{...props}
		>
			{children}
			{showCloseButton && (
				<DialogPrimitive.Close asChild>
					<Button variant="outline">Fechar</Button>
				</DialogPrimitive.Close>
			)}
		</div>
	);
}

function DialogTitle({ className, ...props }: ComponentProps<typeof DialogPrimitive.Title>) {
	return (
		<DialogPrimitive.Title
			className={cn("font-heading text-base leading-none font-medium", className)}
			data-slot="dialog-title"
			{...props}
		/>
	);
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn(
				"text-muted-foreground *:[a]:hover:text-foreground text-sm *:[a]:underline *:[a]:underline-offset-3",
				className,
			)}
			data-slot="dialog-description"
			{...props}
		/>
	);
}

export {
	Dialog,
	DialogBody,
	DialogClose,
	DialogContent,
	DialogDescription,
	DialogFooter,
	DialogHeader,
	DialogOverlay,
	DialogPortal,
	DialogTitle,
	DialogTrigger,
};
