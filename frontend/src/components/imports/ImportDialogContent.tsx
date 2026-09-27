import { type ComponentProps, useContext } from "react";
import { DialogContent } from "@/components/ui/Dialog";
import { ImportDialogContext } from "./import-dialog-context";

export function ImportDialogContent({ onInteractOutside, ...props }: ComponentProps<typeof DialogContent>) {
	const childDialogOpen = useContext(ImportDialogContext);

	return (
		<DialogContent
			{...props}
			onInteractOutside={event => {
				if (childDialogOpen) event.preventDefault();
				onInteractOutside?.(event);
			}}
		/>
	);
}
