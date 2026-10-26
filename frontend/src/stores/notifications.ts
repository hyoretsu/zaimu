import { toast } from "@/lib/toast";

export const showToast = (message: string, kind: "info" | "negative" | "positive" = "info") => {
	if (kind === "positive") return toast.success(message);
	if (kind === "negative") return toast.error(message);
	return toast.info(message);
};
