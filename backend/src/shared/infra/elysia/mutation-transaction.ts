import { AsyncLocalStorage } from "node:async_hooks";
import { withRawTransaction } from "~/shared/infra/sql";

const commitEffects = new AsyncLocalStorage<Array<() => Promise<unknown>>>();

export function afterMutationCommit(effect: () => Promise<unknown>) {
	const effects = commitEffects.getStore();
	if (!effects) throw new Error("Mutação sem transação de request");
	effects.push(effect);
}

class RollbackResponse extends Error {
	constructor(readonly response: Response) {
		super("HTTP mutation failed");
	}
}

export async function runMutationRequest(
	handle: () => Promise<Response>,
	transaction: (operation: () => Promise<Response>) => Promise<Response> = operation =>
		withRawTransaction(operation),
) {
	const effects: Array<() => Promise<unknown>> = [];
	let response: Response;
	try {
		response = await commitEffects.run(effects, () =>
			transaction(async () => {
				const result = await handle();
				if (result.status >= 400) throw new RollbackResponse(result);
				return result;
			}),
		);
	} catch (error) {
		if (error instanceof RollbackResponse) return error.response;
		throw error;
	}
	await Promise.all(effects.map(effect => effect()));
	return response;
}
