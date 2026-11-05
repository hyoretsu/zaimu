import { type ComponentProps, type ReactNode, useEffect, useState } from "react";
import { LuCheck } from "react-icons/lu";
import { Button } from "./Button";
import { Popover, PopoverAnchor, PopoverContent } from "./Popover";

export function ConfirmActionButton({
	confirmation = "Confirmar ação?",
	confirmChildren,
	onConfirm,
	...props
}: Omit<ComponentProps<typeof Button>, "onClick"> & {
	confirmation?: string;
	confirmChildren?: ReactNode;
	onConfirm: () => void | Promise<void>;
}) {
	const [confirming, setConfirming] = useState(false);
	const isIconButton = props.size?.startsWith("icon");
	const confirmationContent = confirmChildren ?? (isIconButton ? <LuCheck /> : "Confirmar");
	useEffect(() => {
		if (!confirming) return;
		const timeout = window.setTimeout(() => setConfirming(false), 3000);
		return () => window.clearTimeout(timeout);
	}, [confirming]);
	return (
		<Popover open={confirming}>
			<PopoverAnchor asChild>
				<div className="inline-flex">
					<Button
						{...props}
						aria-label={confirming ? confirmation : props["aria-label"]}
						onClick={() => (confirming ? void onConfirm() : setConfirming(true))}
					>
						{confirming ? confirmationContent : props.children}
					</Button>
				</div>
			</PopoverAnchor>
			<PopoverContent
				align="end"
				className="w-max max-w-52 rounded-lg px-3 py-2 text-xs"
				onCloseAutoFocus={event => event.preventDefault()}
				onInteractOutside={event => event.preventDefault()}
				onOpenAutoFocus={event => event.preventDefault()}
				side="top"
			>
				{confirmation}
			</PopoverContent>
		</Popover>
	);
}
