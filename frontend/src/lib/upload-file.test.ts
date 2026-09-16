import { expect, test } from "bun:test";
import { assertFileIsAccessible } from "./upload-file";

test("reports when a cloud file cannot be read", async () => {
	const unavailableFile = {
		slice: () => ({ arrayBuffer: () => Promise.reject(new Error("File is unavailable")) }),
	} as File;

	await expect(assertFileIsAccessible(unavailableFile)).rejects.toThrow(
		"Não foi possível acessar o arquivo selecionado.",
	);
});

test("accepts an accessible file", async () => {
	await expect(
		assertFileIsAccessible(new File(["%PDF-"], "statement.pdf", { type: "application/pdf" })),
	).resolves.toBeUndefined();
});
