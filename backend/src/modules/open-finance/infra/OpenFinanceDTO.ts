import { t } from "elysia";

const nullableString = t.Nullable(t.String());
export const CredentialsDTO = t.Object({
	clientId: t.String({ maxLength: 200, minLength: 1 }),
	clientSecret: t.String({ maxLength: 500, minLength: 1 }),
});
export const BindingDTO = t.Object({
	creditCardId: t.Optional(nullableString),
	financialAccountId: t.Optional(nullableString),
	paused: t.Optional(t.Boolean()),
	remoteAccountId: t.String({ maxLength: 200, minLength: 1 }),
});
export const ConfigurationReturn = t.Object({
	available: t.Boolean(),
	configured: t.Boolean(),
	connections: t.Array(
		t.Object({
			bankName: t.String(),
			bankUpdatedAt: nullableString,
			bindings: t.Array(
				t.Object({
					connectionId: t.String(),
					creditCardId: nullableString,
					financialAccountId: nullableString,
					id: t.String(),
					paused: t.Boolean(),
					remoteAccountId: t.String(),
				}),
			),
			id: t.String(),
			itemId: t.String(),
			remoteAccounts: t.Array(
				t.Object({ currencyCode: t.String(), id: t.String(), name: t.String(), type: t.String() }),
			),
			status: t.String(),
		}),
	),
	lastQueriedAt: nullableString,
});
export type ConfigurationReturn = typeof ConfigurationReturn.static;
export const DiscoveryReturn = t.Object({
	...ConfigurationReturn.properties,
	discoveryAvailable: t.Boolean(),
	errors: t.Array(t.Object({ itemId: t.String(), message: t.String() })),
});
export const SuccessReturn = t.Object({ success: t.Boolean() });
export const SyncStartReturn = t.Object({ runId: nullableString });
export const SyncStatusReturn = t.Object({
	reviews: t.Array(t.Object({ count: t.Number(), importId: t.String(), kind: t.String() })),
	run: t.Nullable(
		t.Object({
			errors: t.Array(t.Object({ connectionId: t.String(), message: t.String() })),
			finishedAt: nullableString,
			id: t.String(),
			imported: t.Number(),
			linked: t.Number(),
			pending: t.Number(),
			processed: t.Number(),
			startedAt: t.String(),
			status: t.String(),
		}),
	),
});
export type SyncStatusReturn = typeof SyncStatusReturn.static;
