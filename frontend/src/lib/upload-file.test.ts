import { expect, test } from "bun:test";
import { prepareUploadFile } from "./upload-file";

test("reports when a cloud file cannot be read completely", async () => {
	const unavailableFile = {
		arrayBuffer: () => Promise.reject(new Error("File is unavailable")),
		slice: () => new Blob(["%"]),
	} as unknown as File;

	await expect(prepareUploadFile(unavailableFile)).rejects.toThrow(
		"Não foi possível ler o arquivo selecionado. Verifique o arquivo e tente novamente.",
	);
});

test("uploads an independent snapshot after the source becomes unavailable", async () => {
	const source = new File(["%PDF-full statement"], "statement.pdf", {
		lastModified: 1234,
		type: "application/pdf",
	});
	const upload = await prepareUploadFile(source);
	Object.defineProperty(source, "arrayBuffer", {
		value: () => Promise.reject(new Error("Provider access expired")),
	});

	expect(upload).not.toBe(source);
	expect(upload.name).toBe(source.name);
	expect(upload.type).toBe(source.type);
	expect(upload.lastModified).toBe(source.lastModified);
	const body = new FormData();
	body.set("file", upload);
	const request = new Request("http://localhost/import", { body, method: "POST" });
	const received = (await request.formData()).get("file") as File;
	expect(await received.text()).toBe("%PDF-full statement");
});
