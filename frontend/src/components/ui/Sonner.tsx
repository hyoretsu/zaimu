import {
	Alert02Icon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
	Loading03Icon,
	MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import type { CSSProperties } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const Toaster = ({ ...props }: ToasterProps) => {
	return (
		<Sonner
			className="toaster group"
			icons={{
				error: <HugeiconsIcon className="size-4" icon={MultiplicationSignCircleIcon} strokeWidth={2} />,
				info: <HugeiconsIcon className="size-4" icon={InformationCircleIcon} strokeWidth={2} />,
				loading: <HugeiconsIcon className="size-4 animate-spin" icon={Loading03Icon} strokeWidth={2} />,
				success: <HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} strokeWidth={2} />,
				warning: <HugeiconsIcon className="size-4" icon={Alert02Icon} strokeWidth={2} />,
			}}
			mobileOffset={{ bottom: "calc(5.5rem + env(safe-area-inset-bottom))", left: "1rem", right: "1rem" }}
			style={
				{
					"--border-radius": "var(--radius)",
					"--normal-bg": "var(--popover)",
					"--normal-border": "var(--border)",
					"--normal-text": "var(--popover-foreground)",
				} as CSSProperties
			}
			theme="system"
			toastOptions={{
				classNames: {
					toast: "cn-toast",
				},
			}}
			{...props}
		/>
	);
};

export { Toaster };
