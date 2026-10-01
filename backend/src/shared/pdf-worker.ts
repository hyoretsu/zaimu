import { PDFParse } from "pdf-parse";

// Bun bundles the parser, but PDF.js loads its worker from a separate file.
const workerPath = import.meta.url.includes("/dist/")
	? "./pdf.worker.mjs"
	: "../../../node_modules/pdf-parse/dist/pdf-parse/esm/pdf.worker.mjs";
PDFParse.setWorker(new URL(workerPath, import.meta.url).href);
