let parserModule: Promise<typeof import("pdf-parse")> | undefined;

/** Load PDF.js only for imports, preserving its package-relative native dependencies. */
export function loadPdfParser() {
	if (!parserModule) {
		parserModule = import("pdf-parse")
			.then(module => {
				module.PDFParse.setWorker(new URL("./pdf.worker.mjs", import.meta.resolve("pdf-parse")).href);
				return module;
			})
			.catch(error => {
				parserModule = undefined;
				throw error;
			});
	}
	return parserModule;
}
