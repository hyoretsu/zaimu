import { useEffect } from "react";

const appName = "Zaimu";

/** Sets `<page> - Zaimu` while mounted and restores the previous title on unmount. */
export function useDocumentTitle(title: string) {
	useEffect(() => {
		const previous = document.title;
		document.title = `${title} - ${appName}`;
		return () => {
			document.title = previous;
		};
	}, [title]);
}
