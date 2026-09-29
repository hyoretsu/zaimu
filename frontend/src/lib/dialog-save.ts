import { toast } from "sonner";

export function runDialogSave<T>(operation: Promise<T>, close: () => void, message: string): void {
	close();
	const toastId = toast.loading(message, { position: "bottom-right" });
	void operation.finally(() => toast.dismiss(toastId)).catch(() => undefined);
}
