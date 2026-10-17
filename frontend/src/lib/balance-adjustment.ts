type RemoteBalanceAdjustment = import("./api").GetBalanceAdjustmentsQueryResponse[number];

/** Guest records retain their locally selected currency. */
export type BalanceAdjustment = RemoteBalanceAdjustment & { currency?: string };
