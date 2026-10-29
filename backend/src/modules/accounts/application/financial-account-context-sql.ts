import { cardRuleValuesSql } from "./institution-card-rules";

// Resolve expensive rules before outer joins can multiply the planner's row estimate.
export const financialAccountContextSql = `
WITH account_context AS MATERIALIZED (
 SELECT account.*, CASE WHEN account.type='CREDIT_CARD' THEN ${cardRuleValuesSql("account")} ELSE NULL END AS resolved_card_rules
 FROM "FinancialAccount" account WHERE account."userId"=$1
)
SELECT to_jsonb(account) - 'balance' - 'resolved_card_rules' AS account, to_jsonb(institution) AS institution,
 to_jsonb(card) || account.resolved_card_rules AS card, to_jsonb(rewards) AS rewards
FROM account_context account
LEFT JOIN "FinancialInstitution" institution ON institution."id" = account."institutionId"
LEFT JOIN "CreditCard" card ON card."financialAccountId" = account."id"
LEFT JOIN "RewardsAccount" rewards ON rewards."financialAccountId" = account."id"
ORDER BY account."name", account."id"`;
