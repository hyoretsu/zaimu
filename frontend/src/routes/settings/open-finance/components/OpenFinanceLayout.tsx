import type { ReactNode } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useMediaQuery } from "@/hooks/use-media-query";

export function OpenFinanceLayout({ children }: { children: ReactNode }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	const content = <PageContainer className="space-y-6">{children}</PageContainer>;
	return isMobile ? content : <ScrollArea className="h-dvh min-h-0">{content}</ScrollArea>;
}
