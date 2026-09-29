import type { IconType } from "react-icons";

export interface MobilePageAction {
	disabled?: boolean;
	icon: IconType;
	label: string;
	onClick: () => void;
}
