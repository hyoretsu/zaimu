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
	addConnection: (itemId: string) =>
		postOpenFinanceConnections({ body: { itemId } }).then(result => result.data),
	configuration: () => getOpenFinance({}).then(result => result.data),
	disconnect: (connectionId?: string) =>
		connectionId
			? deleteOpenFinanceConnectionsById({ path: { id: connectionId } }).then(result => result.data)
			: deleteOpenFinance({}).then(result => result.data),
	discoverConnections: () => postOpenFinanceConnectionsDiscover({}).then(result => result.data),
	saveBinding: (
		connectionId: string,
		input: Pick<OpenFinanceBinding, "remoteAccountId" | "creditCardId" | "financialAccountId" | "paused">,
	) =>
		putOpenFinanceConnectionsByIdBindings({ body: input, path: { id: connectionId } }).then(
			result => result.data,
		),
	saveCredentials: (clientId: string, clientSecret: string) =>
		putOpenFinanceCredentials({ body: { clientId, clientSecret } }).then(result => result.data),
	status: () => getOpenFinanceSync({}).then(result => result.data),
	sync: (force = false) => postOpenFinanceSync({ body: { force } }).then(result => result.data),
};
