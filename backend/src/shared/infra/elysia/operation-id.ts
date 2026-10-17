/** Stable SDK identifiers: GET /accounts/:id becomes getAccountsById. */
export function operationId(method: string, path: string): string {
	return (
		method.toLowerCase() +
		path
			.split("/")
			.filter(Boolean)
			.map(segment => {
				const parameter = segment.match(/^\{(.+)\}$/);
				return (
					(parameter ? "By" : "") +
					(parameter?.[1] ?? segment)
						.split(/[-_]/)
						.map(word => word[0]!.toUpperCase() + word.slice(1))
						.join("")
				);
			})
			.join("")
	);
}
