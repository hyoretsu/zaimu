import { z } from "zod";
const date = z.iso.date();
const amount = z.number().finite().nonnegative();
const ids = z.array(z.string().min(1).max(200)).max(500);
const operation = z.object({
	accountId: z.string(),
	input: z.object({
		amount: amount.positive().optional(),
		count: z.number().int().min(1).max(1200).optional(),
		date,
		installmentIds: ids.optional(),
		mode: z.enum(["FRONT", "BACK", "SELECTED", "REDUCE_TERM", "REDUCE_PAYMENT", "PAYOFF"]),
		quotedAmount: amount.positive().optional(),
	}),
	loanId: z.string(),
	repeatEveryMonths: z.number().int().min(1).optional(),
	repetitions: z.number().int().min(1).max(1200).optional(),
});
export const savedLoanPlannerParameters = z.object({
	accountId: z.string(),
	budget: amount,
	currency: z.string().length(3),
	eligibility: z.object({
		accountIds: ids,
		allAccounts: z.boolean(),
		excludeAccountIds: ids,
		includeAccountIds: ids,
		includeInvestments: z.boolean(),
	}),
	liquidity: z.record(
		z.string(),
		z.object({
			availableFrom: date.optional(),
			redemptionCost: amount.optional(),
			redemptionDays: z.number().int().nonnegative().optional(),
		}),
	),
	loans: z.array(z.object({ loanId: z.string(), paymentAccountId: z.string() })).max(500),
	reserve: amount,
	scenario: z.object({
		id: z.string(),
		name: z.string().max(150),
		operations: z.array(operation).max(1200),
		transfers: z
			.array(
				z.object({
					amount: amount.positive(),
					date,
					destinationAmount: amount.optional(),
					fromAccountId: z.string(),
					toAccountId: z.string(),
				}),
			)
			.max(500),
	}),
	selectedLoanIds: ids.optional(),
	version: z.literal(1),
});
export type SavedLoanPlannerParameters = z.infer<typeof savedLoanPlannerParameters>;
