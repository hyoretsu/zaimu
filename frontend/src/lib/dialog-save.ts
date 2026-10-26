import { toast } from "@/lib/toast";

export function runDialogSave<T>(operation: Promise<T>, close: () => void, message: string): void {
	close();
	const toastId = toast.loading(message);
	void operation.finally(() => toast.dismiss(toastId)).catch(() => undefined);
}
