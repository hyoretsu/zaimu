import type { ReactNode } from "react";
import { PageContainer } from "@/components/ui/PageContainer";
import { PageHeader } from "@/components/ui/PageHeader";
import { ScrollArea } from "@/components/ui/ScrollArea";
import { useMediaQuery } from "@/hooks/use-media-query";

export function OpenFinanceLayout({ children }: { children: ReactNode }) {
	const isMobile = useMediaQuery("(max-width: 1023px)");
	const content = (
		<PageContainer className="space-y-6">
			<PageHeader
				backTo="/settings"
				description="Meu Pluggy: conecte seus bancos e importe seu histórico automaticamente."
				title="Open Finance"
			/>
			{children}
		</PageContainer>
	);
	return isMobile ? content : <ScrollArea className="h-dvh min-h-0">{content}</ScrollArea>;
}
