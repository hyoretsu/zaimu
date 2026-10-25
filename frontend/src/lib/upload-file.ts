const inaccessibleFileMessage = "Não foi possível ler o arquivo selecionado. Verifique o arquivo e tente novamente.";

export async function prepareUploadFile(file: File): Promise<File> {
	try {
		// Materialize provider-backed mobile files before fetch serializes multipart data.
		const bytes = await file.arrayBuffer();
		return new File([bytes], file.name, { lastModified: file.lastModified, type: file.type });
	} catch (cause) {
		throw new Error(inaccessibleFileMessage, { cause });
	}
}
