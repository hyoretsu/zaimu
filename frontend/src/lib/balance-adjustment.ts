type RemoteBalanceAdjustment = import("./api").GetBalanceAdjustmentsResponse[number];

/** Guest records retain their locally selected currency. */
export type BalanceAdjustment = Omit<RemoteBalanceAdjustment, "balance" | "calculatedBalance"> & {
	assetCode: string;
	balance: string;
	calculatedBalance?: string;
	currency?: string;
};
