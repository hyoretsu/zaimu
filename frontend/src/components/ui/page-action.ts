import type { ComponentProps } from "react";
import type { IconType } from "react-icons";
import type { Button } from "./Button";

export interface PageAction {
	disabled?: boolean;
	icon: IconType;
	label: string;
	onClick: () => void;
	variant?: ComponentProps<typeof Button>["variant"];
}
