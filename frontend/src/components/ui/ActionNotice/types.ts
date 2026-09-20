import type { ReactNode } from "react";

export type ActionNoticeTone = "primary" | "warning";

export interface ActionNoticeProps {
	action?: ReactNode;
	children?: ReactNode;
	description: ReactNode;
	icon: ReactNode;
	title: ReactNode;
	tone?: ActionNoticeTone;
}
