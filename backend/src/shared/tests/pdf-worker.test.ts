import { expect, test } from "bun:test";
import { loadPdfParser } from "../pdf-worker";

function textPdf() {
	const stream = "BT /F1 12 Tf 20 80 Td (Performance fixture) Tj ET";
	const objects = [
		"<< /Type /Catalog /Pages 2 0 R >>",
		"<< /Type /Pages /Kids [3 0 R] /Count 1 >>",
		"<< /Type /Page /Parent 2 0 R /MediaBox [0 0 200 100] /Resources << /Font << /F1 4 0 R >> >> /Contents 5 0 R >>",
		"<< /Type /Font /Subtype /Type1 /BaseFont /Helvetica >>",
		`<< /Length ${stream.length} >>\nstream\n${stream}\nendstream`,
	];
	let pdf = "%PDF-1.4\n";
	const offsets = [0];
	for (const [index, object] of objects.entries()) {
		offsets.push(pdf.length);
		pdf += `${index + 1} 0 obj\n${object}\nendobj\n`;
	}
	const xref = pdf.length;
	pdf += `xref\n0 ${offsets.length}\n0000000000 65535 f \n`;
	for (const offset of offsets.slice(1)) pdf += `${String(offset).padStart(10, "0")} 00000 n \n`;
	pdf += `trailer\n<< /Size ${offsets.length} /Root 1 0 R >>\nstartxref\n${xref}\n%%EOF`;
	return new TextEncoder().encode(pdf);
}

test("deduplicates lazy parser initialization and reads a local PDF", async () => {
	const [first, second] = await Promise.all([loadPdfParser(), loadPdfParser()]);
	expect(first).toBe(second);
	const parser = new first.PDFParse({ data: textPdf() });
	try {
		expect((await parser.getText()).text).toContain("Performance fixture");
	} finally {
		await parser.destroy();
	}
});
