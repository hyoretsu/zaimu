import { Buffer } from "node:buffer";

/** Deterministic, uncompressed PDF. No filesystem, provider, or font download. */
export function pdfFixture(lines: readonly string[]): Uint8Array {
	const pages = Array.from({ length: Math.ceil(lines.length / 35) }, (_, index) =>
		lines.slice(index * 35, (index + 1) * 35),
	);
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica /Encoding /WinAnsiEncoding >>",
	];
	const pageIds: number[] = [];
	for (const page of pages) {
		const pageId = objects.length + 1;
		pageIds.push(pageId);
		const stream = `BT /F1 10 Tf 14 TL 40 780 Td\n${page.map((line, index) => `${index ? "T* " : ""}(${line.replace(/[\\()]/g, "\\$&")}) Tj`).join("\n")}\nET`;
		objects.push(
			`<< /Type /Page /Parent 2 0 R /MediaBox [0 0 595 842] /Resources << /Font << /F1 3 0 R >> >> /Contents ${pageId + 1} 0 R >>`,
			`<< /Length ${Buffer.byteLength(stream, "latin1")} >>\nstream\n${stream}\nendstream`,
		);
	}
	objects[1] = `<< /Type /Pages /Kids [${pageIds.map(id => `${id} 0 R`).join(" ")}] /Count ${pages.length} >>`;
	let body = "%PDF-1.4\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(Buffer.byteLength(body, "latin1"));
		body += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = Buffer.byteLength(body, "latin1");
	body += `xref\n0 ${objects.length + 1}\n0000000000 65535 f \n${offsets
		.slice(1)
		.map(offset => `${String(offset).padStart(10, "0")} 00000 n \n`)
		.join("")}trailer\n<< /Size ${objects.length + 1} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF\n`;
	return new Uint8Array(Buffer.from(body, "latin1"));
}
