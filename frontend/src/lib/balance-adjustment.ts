type RemoteBalanceAdjustment = import("./api").GetBalanceAdjustmentsResponse[number];

/** Guest records retain their locally selected currency. */
export type BalanceAdjustment = RemoteBalanceAdjustment & { currency?: string };
