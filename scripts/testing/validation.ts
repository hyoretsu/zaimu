export function assertTestClassification(discovered: string[], classified: string[]) {
	if (
		classified.length !== new Set(classified).size ||
		discovered.some(file => !classified.includes(file)) ||
		classified.some(file => !discovered.includes(file))
	)
		throw new Error(
			"Test classification mismatch. Classify every test exactly once in scripts/testing/test-manifest.json.",
		);
}
export function assertCompleteReport(xml: string, label: string) {
	if (
		/<(?:skipped|pending|todo)\b|\b(?:skipped|disabled|pending|todo)="[1-9]/.test(xml) ||
		!/<testcase\b/.test(xml)
	)
		throw new Error(`Skipped, pending or empty suite: ${label}`);
}
export function assertLocalDockerSocket(host: string) {
	if (!host.startsWith("unix:///") || host.includes("\n"))
		throw new Error("Disposable tests require a local Unix Docker socket");
}
