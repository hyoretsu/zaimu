const inaccessibleFileMessage = "Não foi possível acessar o arquivo selecionado.";

export async function assertFileIsAccessible(file: File): Promise<void> {
	try {
		await file.slice(0, 1).arrayBuffer();
	} catch (cause) {
		throw new Error(inaccessibleFileMessage, { cause });
	}
}
