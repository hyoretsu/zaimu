import "@/index.css";
import { createRoot } from "react-dom/client";
import { Toaster } from "@/components/ui/Sonner";
import { toast } from "@/lib/toast";

declare global {
	interface Window {
		notifications: typeof toast;
		recovered: number;
	}
}
window.notifications = toast;
window.recovered = 0;
createRoot(document.getElementById("root")!).render(<Toaster richColors />);
