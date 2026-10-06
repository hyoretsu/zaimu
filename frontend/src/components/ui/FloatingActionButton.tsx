import type { ComponentProps } from "react";
import type { IconType } from "react-icons";
import { Button } from "./Button";

export function FloatingActionButton({
	icon: Icon,
	label,
	...props
}: Omit<ComponentProps<typeof Button>, "children" | "className" | "size" | "aria-label"> & {
	icon: IconType;
	label: string;
}) {
	return (
		<Button
			{...props}
			aria-label={label}
			className="size-14 cursor-pointer rounded-full border-primary/30 shadow-xl disabled:cursor-not-allowed"
			size="icon"
			type="button"
		>
			<Icon aria-hidden="true" className="size-6" />
		</Button>
	);
}
