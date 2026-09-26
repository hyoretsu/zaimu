import { Cancel01Icon } from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { Dialog as DialogPrimitive } from "radix-ui";
import type { ComponentProps } from "react";
import { Button } from "@/components/ui/Button";
import { usePageScrollLock } from "@/hooks/use-page-scroll-lock";
import { cn } from "@/lib/utils";

function Dialog({ modal = false, ...props }: ComponentProps<typeof DialogPrimitive.Root>) {
	return <DialogPrimitive.Root data-slot="dialog" modal={modal} {...props} />;
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

function DialogOverlay({ className, ...props }: ComponentProps<"div">) {
	usePageScrollLock();

	return (
		<div
			className={cn(
				"data-open:fade-in-0 data-closed:fade-out-0 fixed inset-0 isolate z-50 bg-black/80 duration-100 data-closed:animate-out data-open:animate-in supports-backdrop-filter:backdrop-blur-xs",
				className,
			)}
			data-slot="dialog-overlay"
			{...props}
		/>
	);
}

function DialogContent({
	className,
	children,
	overlayClassName,
	showCloseButton = true,
	...props
}: ComponentProps<typeof DialogPrimitive.Content> & {
	overlayClassName?: string;
	showCloseButton?: boolean;
}) {
	return (
		<DialogPortal>
			<DialogOverlay className={overlayClassName} />
			<DialogPrimitive.Content
				className={cn(
					"scrollbar-themed data-open:fade-in-0 data-open:zoom-in-95 data-closed:fade-out-0 data-closed:zoom-out-95 fixed top-1/2 left-1/2 z-50 grid max-h-[calc(100dvh-2rem)] w-full max-w-[calc(100%-2rem)] -translate-x-1/2 -translate-y-1/2 gap-6 overflow-y-auto rounded-4xl bg-popover p-6 text-popover-foreground text-sm outline-none ring-1 ring-foreground/5 duration-100 data-closed:animate-out data-open:animate-in sm:max-w-md",
					className,
				)}
				data-slot="dialog-content"
				{...props}
			>
				{children}
				{showCloseButton && (
					<DialogPrimitive.Close asChild data-slot="dialog-close">
						<Button className="absolute top-4 right-4" size="icon-sm" variant="ghost">
							<HugeiconsIcon icon={Cancel01Icon} strokeWidth={2} />
							<span className="sr-only">Fechar</span>
						</Button>
					</DialogPrimitive.Close>
				)}
			</DialogPrimitive.Content>
		</DialogPortal>
	);
}

function DialogHeader({ className, ...props }: ComponentProps<"div">) {
	return <div className={cn("flex flex-col gap-2", className)} data-slot="dialog-header" {...props} />;
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
			className={cn("flex flex-col-reverse gap-2 sm:flex-row sm:justify-end", className)}
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
			className={cn("font-heading font-medium text-base leading-none", className)}
			data-slot="dialog-title"
			{...props}
		/>
	);
}

function DialogDescription({ className, ...props }: ComponentProps<typeof DialogPrimitive.Description>) {
	return (
		<DialogPrimitive.Description
			className={cn(
				"text-muted-foreground text-sm *:[a]:underline *:[a]:underline-offset-3 *:[a]:hover:text-foreground",
				className,
			)}
			data-slot="dialog-description"
			{...props}
		/>
	);
}

export {
	Dialog,
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
