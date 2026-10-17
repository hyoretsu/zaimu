import type { OpenFinanceBinding } from "./domain";
import {
	deleteOpenFinance,
	deleteOpenFinanceConnectionsById,
	getOpenFinance,
	getOpenFinanceSync,
	postOpenFinanceConnections,
	postOpenFinanceConnectionsDiscover,
	postOpenFinanceSync,
	putOpenFinanceConnectionsByIdBindings,
	putOpenFinanceCredentials,
} from "./generated/api";

export const openFinanceApi = {
	addConnection: (itemId: string) => postOpenFinanceConnections({ itemId }),
	configuration: () => getOpenFinance(),
	disconnect: (connectionId?: string) =>
		connectionId ? deleteOpenFinanceConnectionsById(connectionId) : deleteOpenFinance(),
	discoverConnections: () => postOpenFinanceConnectionsDiscover(),
	saveBinding: (
		connectionId: string,
		input: Pick<OpenFinanceBinding, "remoteAccountId" | "creditCardId" | "financialAccountId" | "paused">,
	) => putOpenFinanceConnectionsByIdBindings(connectionId, input),
	saveCredentials: (clientId: string, clientSecret: string) =>
		putOpenFinanceCredentials({ clientId, clientSecret }),
	status: () => getOpenFinanceSync(),
	sync: (force = false) => postOpenFinanceSync({ force }),
};
