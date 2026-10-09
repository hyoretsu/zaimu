interface CoverageItem {
	result: string;
}
interface Route extends CoverageItem {
	method: string;
	path: string;
}
interface Coverage {
	routes: Route[];
	screens: CoverageItem[];
	journeys: CoverageItem[];
}
interface Result {
	passed?: boolean;
	samples?: { method?: string; path?: string }[];
}

/** Routes are covered only by executed scenarios; absent screens/jobs cannot become green. */
export function evaluateCoverage<C extends Coverage>(coverage: C, results: Record<string, unknown>) {
	const routes = coverage.routes.map(route => {
		const pattern = new RegExp(
			`^${route.path
				.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")
				.replace(/:[A-Za-z]+/g, "[^/]+")
				.replace(/\/$/, "")}/?$`,
		);
		const matching = Object.values(results)
			.map(value => value as Result)
			.filter(result =>
				result.samples?.some(
					sample => sample.method === route.method && sample.path && pattern.test(sample.path),
				),
			);
		return {
			...route,
			result: !matching.length ? "pending" : matching.every(result => result.passed) ? "passed" : "failed",
		};
	});
	return { ...coverage, routes };
}

export function completeCoverage(coverage: Coverage) {
	return [coverage.routes, coverage.screens, coverage.journeys].every(
		group => group.length > 0 && group.every(item => item.result === "passed"),
	);
}
