import { HttpException } from "~/shared/errors";
import type { PluggyCredentials } from "./credentials";

export interface RemoteAccount {
	id: string;
	itemId: string;
	name: string;
	type: string;
	subtype?: string;
	currencyCode?: string;
}
export interface RemoteItem {
	id: string;
	status: string;
	lastUpdatedAt?: string;
	connector?: { name?: string };
}
export interface RemoteBill {
	id: string;
	dueDate: string;
	closingDate?: string;
}
export interface RemoteTransaction {
	id: string;
	providerId?: string | null;
	accountId: string;
	date: string;
	amount: number;
	description: string;
	status?: string;
	type?: string;
	operationType?: string;
	currencyCode?: string;
	creditCardMetadata?: {
		installmentNumber?: number;
		totalInstallments?: number;
		totalAmount?: number;
		purchaseDate?: string;
		purchaseTime?: string;
		billId?: string;
		type?: string;
	};
}
interface Page<T> {
	results: T[];
	totalPages: number;
	page: number;
}
type Transport = (input: string, init?: RequestInit) => Promise<Response>;

export class PluggyDiscoveryUnavailable extends Error {
	constructor() {
		super("Listagem de conexões precisa ser habilitada pelo suporte Pluggy para sua equipe.");
	}
}

export class PluggyClient {
	private token: string | null = null;
	private expiresAt = 0;
	private authenticating: Promise<string> | null = null;
	constructor(
		private readonly credentials: PluggyCredentials,
		private readonly transport: Transport = fetch,
	) {}
	private async authenticate(): Promise<string> {
		if (this.token && Date.now() < this.expiresAt) return this.token;
		if (this.authenticating) return this.authenticating;
		this.authenticating = (async () => {
			const response = await this.send("/auth", { body: JSON.stringify(this.credentials), method: "POST" });
			const data = (await response.json()) as { apiKey?: string };
			if (!data.apiKey) throw new HttpException("Resposta de autenticação Pluggy inválida", 502);
			this.token = data.apiKey;
			this.expiresAt = Date.now() + 110 * 60_000;
			return this.token;
		})();
		try {
			return await this.authenticating;
		} finally {
			this.authenticating = null;
		}
	}
	private async send(path: string, init: RequestInit) {
		let response: Response;
		try {
			response = await this.transport(`https://api.pluggy.ai${path}`, {
				...init,
				headers: { "Content-Type": "application/json", ...init.headers },
				signal: AbortSignal.timeout(30_000),
			});
		} catch {
			throw new HttpException("Pluggy temporariamente indisponível. Tente novamente.", 502);
		}
		if (response.ok) return response;
		if (response.status === 403 && path.startsWith("/v2/items")) {
			const body = await response.json().catch(() => null);
			if (
				body &&
				typeof body === "object" &&
				"codeDescription" in body &&
				body.codeDescription === "LIST_ITEMS_FEATURE_NOT_ENABLED"
			)
				throw new PluggyDiscoveryUnavailable();
		}
		// Never retain response bodies, URLs with secrets, or upstream error objects.
		if (response.status === 429)
			throw new HttpException("Limite de consultas Pluggy atingido. Tente novamente mais tarde.", 429);
		if (response.status === 401 || response.status === 403)
			throw new HttpException("Credenciais ou autorização Pluggy inválidas", 422);
		if (response.status === 404)
			throw new HttpException("Conexão Pluggy não encontrada. Confira o itemId.", 422);
		throw new HttpException("Não foi possível consultar a Pluggy", 502);
	}
	async validate() {
		await this.authenticate();
	}
	async get<T>(path: string): Promise<T> {
		const token = await this.authenticate();
		let response: Response;
		try {
			response = await this.send(path, { headers: { "X-API-KEY": token } });
		} catch (error) {
			if (
				!(error instanceof HttpException) ||
				error.statusCode !== 422 ||
				!error.message.includes("autorização")
			)
				throw error;
			this.token = null;
			response = await this.send(path, { headers: { "X-API-KEY": await this.authenticate() } });
		}
		return (await response.json()) as T;
	}
	async *pages<T>(path: string) {
		for (let page = 1; ; page++) {
			const result = await this.get<Page<T>>(
				`${path}${path.includes("?") ? "&" : "?"}page=${page}&pageSize=500`,
			);
			if (!Array.isArray(result.results) || !Number.isInteger(result.totalPages) || result.totalPages < 0)
				throw new HttpException("Paginação Pluggy inválida", 502);
			yield result.results;
			if (page >= result.totalPages) break;
			if (page >= 10_000) throw new HttpException("Histórico Pluggy excedeu o limite de páginas", 502);
		}
	}
	async accounts(itemId: string) {
		const accounts: RemoteAccount[] = [];
		for await (const page of this.pages<RemoteAccount>(`/accounts?itemId=${encodeURIComponent(itemId)}`))
			accounts.push(...page);
		return accounts;
	}
	item(itemId: string) {
		return this.get<RemoteItem>(`/items/${encodeURIComponent(itemId)}`);
	}
	async items() {
		const items: RemoteItem[] = [];
		const visited = new Set<string>();
		let path: string | null = "/v2/items";
		while (path) {
			if (visited.has(path) || visited.size >= 10_000)
				throw new HttpException("Paginação de conexões Pluggy inválida", 502);
			visited.add(path);
			const page: { results: RemoteItem[]; next: string | null } = await this.get(path);
			if (!Array.isArray(page.results) || (page.next !== null && typeof page.next !== "string"))
				throw new HttpException("Paginação de conexões Pluggy inválida", 502);
			items.push(...page.results);
			if (page.next !== null && (!page.next.startsWith("?") || /[\r\n#]/.test(page.next)))
				throw new HttpException("Cursor de conexões Pluggy inválido", 502);
			path = page.next === null ? null : `/v2/items${page.next}`;
		}
		return items;
	}
	transactions(accountId: string) {
		return this.pages<RemoteTransaction>(`/transactions?accountId=${encodeURIComponent(accountId)}`);
	}
	async bills(accountId: string) {
		const bills: RemoteBill[] = [];
		for await (const page of this.pages<RemoteBill>(`/bills?accountId=${encodeURIComponent(accountId)}`))
			bills.push(...page);
		return bills;
	}
}
