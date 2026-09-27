import type { ComponentProps } from "react";
import { Dialog } from "@/components/ui/Dialog";
import { ImportDialogContext } from "./import-dialog-context";

/** Keep import reviews and their secondary dialogs isolated from outside focus. */
export function ImportDialog({
	childDialogOpen = false,
	onOpenChange,
	...props
}: Omit<ComponentProps<typeof Dialog>, "modal"> & { childDialogOpen?: boolean }) {
	return (
		<ImportDialogContext.Provider value={childDialogOpen}>
			<Dialog
				{...props}
				modal
				onOpenChange={open => {
					if (!open && childDialogOpen) return;
					onOpenChange?.(open);
				}}
			/>
		</ImportDialogContext.Provider>
	);
}
