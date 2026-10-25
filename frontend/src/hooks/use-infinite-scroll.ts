import { useEffect, useRef } from "react";

export function useInfiniteScroll({ enabled, onLoadMore }: { enabled: boolean; onLoadMore: () => unknown }) {
	const sentinelRef = useRef<HTMLDivElement>(null);

	useEffect(() => {
		const sentinel = sentinelRef.current;
		if (!enabled || !sentinel) return;

		let requested = false;
		const observer = new IntersectionObserver(
			entries => {
				if (requested || !entries.some(entry => entry.isIntersecting)) return;
				requested = true;
				void onLoadMore();
			},
			{
				root: sentinel.closest('[data-slot="scroll-area-viewport"]'),
				rootMargin: "0px 0px 160px 0px",
			},
		);
		observer.observe(sentinel);
		return () => observer.disconnect();
	}, [enabled, onLoadMore]);

	return sentinelRef;
}
