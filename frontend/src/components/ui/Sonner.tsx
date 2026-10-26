import {
	Alert02Icon,
	CheckmarkCircle02Icon,
	InformationCircleIcon,
	Loading03Icon,
	MultiplicationSignCircleIcon,
} from "@hugeicons/core-free-icons";
import { HugeiconsIcon } from "@hugeicons/react";
import { type CSSProperties, useSyncExternalStore } from "react";
import { Toaster as Sonner, type ToasterProps } from "sonner";

const desktopQuery = "(min-width: 768px) and (hover: hover) and (pointer: fine)";
const subscribe = (callback: () => void) => {
	const media = window.matchMedia(desktopQuery);
	media.addEventListener("change", callback);
	return () => media.removeEventListener("change", callback);
};
const desktopSnapshot = () => window.matchMedia(desktopQuery).matches;

const Toaster = ({ ...props }: ToasterProps) => {
	const desktop = useSyncExternalStore(subscribe, desktopSnapshot, () => false);
	return (
		<Sonner
			className="toaster group"
			icons={{
				error: (
					<HugeiconsIcon className="size-4" icon={MultiplicationSignCircleIcon} strokeWidth={2} />
				),
				info: <HugeiconsIcon className="size-4" icon={InformationCircleIcon} strokeWidth={2} />,
				loading: (
					<HugeiconsIcon className="size-4 animate-spin" icon={Loading03Icon} strokeWidth={2} />
				),
				success: <HugeiconsIcon className="size-4" icon={CheckmarkCircle02Icon} strokeWidth={2} />,
				warning: <HugeiconsIcon className="size-4" icon={Alert02Icon} strokeWidth={2} />,
			}}
			mobileOffset={{ left: "1rem", right: "1rem", top: "calc(1rem + env(safe-area-inset-top))" }}
			style={
				{
					"--border-radius": "var(--radius)",
					"--normal-bg": "var(--popover)",
					"--normal-border": "var(--border)",
					"--normal-text": "var(--popover-foreground)",
					"--toast-close-button-end": "0",
					"--toast-close-button-start": "auto",
					"--toast-close-button-transform": "translate(35%, -35%)",
				} as CSSProperties
			}
			theme="system"
			toastOptions={{
				classNames: {
					toast: "cn-toast select-none",
				},
				closeButtonAriaLabel: "Fechar notificação",
			}}
			{...props}
			closeButton={desktop}
			position="top-center"
			swipeDirections={["left", "right", "top"]}
			visibleToasts={5}
		/>
	);
};

export { Toaster };
