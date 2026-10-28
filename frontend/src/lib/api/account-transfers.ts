import client from "./client-api";

export interface OwnershipTransfer {
	id: string;
	senderId: string;
	recipientId: string;
	senderName: string;
	recipientName: string;
	status: "PENDING" | "ACCEPTED" | "DECLINED" | "CANCELLED";
	createdAt: string;
	respondedAt: string | null;
	summary: { accounts: Array<{ name: string | null; type: string }> };
}
export interface OwnershipTransferPreview {
	transfer: OwnershipTransfer;
	version: string | null;
	accounts: Array<{
		id: string;
		name: string | null;
		destinationName: string;
		type: string;
		currency: string;
		institutionName: string | null;
		balance: number;
		isHidden: boolean;
		rewardsKind: "POINTS" | "CASHBACK" | null;
		statements: Array<{
			id: string;
			dueDate: string;
			totalAmount: number;
			amountDue: number;
			currency: string;
		}>;
	}>;
	counts: {
		transactions: number;
		purchases: number;
		statements: number;
		recurrences: number;
		pausedRecurrences: number;
		separatedMovements: number;
		imports: number;
	};
	warnings: string[];
}
export const ownershipTransfers = {
	create: async (data: { recipientEmail: string; accountIds: string[] }) =>
		(await client<OwnershipTransfer>({ data, method: "POST", url: "/account-transfers" })).data,
	list: async (signal?: AbortSignal) =>
		(await client<OwnershipTransfer[]>({ method: "GET", signal, url: "/account-transfers" })).data,
	preview: async (id: string, signal?: AbortSignal) =>
		(
			await client<OwnershipTransferPreview>({
				method: "GET",
				signal,
				url: `/account-transfers/${encodeURIComponent(id)}`,
			})
		).data,
	respond: async (id: string, action: "accept" | "decline" | "cancel", version?: string) =>
		(
			await client<OwnershipTransfer>({
				method: "POST",
				url: `/account-transfers/${encodeURIComponent(id)}/${action}`,
				...(action === "accept" ? { data: { version } } : {}),
			})
		).data,
};
