import { hasBudgetConflict, validateBudgetHierarchy } from "@zaimu/finance/monthly-budget";
import { useAuthStore } from "@/stores/auth";
import { fetchWithAuth } from "./dataService";
import { hardDelete, localCategories, localMonthlyBudgets } from "./localStorage";
import { type MonthlyBudget, type MonthlyBudgetInput, validateMonthlyBudget } from "./monthly-budget";
import { type CacheIdentity, getCurrentCacheIdentity } from "./query-cache";

export type { MonthlyBudget, MonthlyBudgetInput } from "./monthly-budget";
export interface MonthlyBudgetSummary {
	month: string;
	items: (Omit<MonthlyBudget, "userId"> & {
		plannedAmount: number;
		knownAmount: number;
		additionalAmount: number;
		projectedAmount: number;
	})[];
}

function context() {
	const owner = getCurrentCacheIdentity();
	if (!owner) throw new Error("Identidade indisponível.");
	const state = useAuthStore.getState();
	return { local: state.isGuestMode || !navigator.onLine, owner, userId: state.user?.id ?? state.guestId };
}

async function validateLocal(input: MonthlyBudgetInput, owner: CacheIdentity, id?: string) {
	const data = validateMonthlyBudget(input);
	if (data.categoryId && !(await localCategories.getById(data.categoryId, owner)))
		throw new Error("Tag não encontrada.");
	const budgets = (await localMonthlyBudgets.getAll(owner)).map(row => row.data);
	validateBudgetHierarchy(budgets, data, id);
	if (hasBudgetConflict(budgets, data, id))
		throw new Error("Já existe planejamento para essa origem e moeda no período.");
	return data;
}

function cache(budget: MonthlyBudget, owner: CacheIdentity) {
	void localMonthlyBudgets
		.bulkPut([{ data: budget, localId: budget.id, syncedAt: Date.now() }], owner)
		.catch(() => undefined);
}

export const monthlyBudgetService = {
	async create(input: MonthlyBudgetInput): Promise<MonthlyBudget> {
		const { owner, local, userId } = context();
		const data = local ? await validateLocal(input, owner) : validateMonthlyBudget(input);
		if (local) {
			const now = new Date().toISOString();
			const budget = { ...data, createdAt: now, id: crypto.randomUUID(), updatedAt: now, userId };
			await localMonthlyBudgets.put(budget, budget.id, owner);
			return budget;
		}
		const budget = await fetchWithAuth<MonthlyBudget>("/monthly-budgets", {
			body: JSON.stringify(data),
			method: "POST",
		});
		cache(budget, owner);
		return budget;
	},
	async delete(id: string): Promise<void> {
		const { owner, local } = context();
		const budgets = await localMonthlyBudgets.getAll(owner);
		const ids = new Set([id]);
		let previousSize = 0;
		while (previousSize !== ids.size) {
			previousSize = ids.size;
			for (const { data } of budgets) {
				if (data.parentBudgetId && ids.has(data.parentBudgetId)) ids.add(data.id);
			}
		}
		if (local) {
			for (const budgetId of [...ids].reverse()) await localMonthlyBudgets.delete(budgetId, owner);
		} else {
			await fetchWithAuth(`/monthly-budgets/${encodeURIComponent(id)}`, { method: "DELETE" });
			await Promise.all([...ids].map(budgetId => hardDelete("monthlyBudgets", budgetId, owner))).catch(
				() => undefined,
			);
		}
	},
	async getAll(): Promise<MonthlyBudget[]> {
		const { owner, local } = context();
		if (local) return (await localMonthlyBudgets.getAll(owner)).map(row => row.data);
		const budgets = await fetchWithAuth<MonthlyBudget[]>("/monthly-budgets");
		void localMonthlyBudgets
			.replaceSnapshot(
				budgets.map(data => ({ data, localId: data.id, syncedAt: Date.now() })),
				owner,
			)
			.catch(() => undefined);
		return budgets;
	},
	async getSummary(month: string): Promise<MonthlyBudgetSummary> {
		if (!/^\d{4}-(0[1-9]|1[0-2])$/.test(month)) throw new Error("Informe um mês válido.");
		const { local } = context();
		if (local) return (await import("./monthly-budget-summary")).guestMonthlyBudgetSummary(month);
		return fetchWithAuth(`/monthly-budgets/summary?${new URLSearchParams({ month })}`);
	},
	async update(id: string, input: MonthlyBudgetInput): Promise<MonthlyBudget> {
		const { owner, local } = context();
		const data = local ? await validateLocal(input, owner, id) : validateMonthlyBudget(input);
		if (local) {
			const existing = await localMonthlyBudgets.getById(id, owner);
			if (!existing) throw new Error("Planejamento não encontrado.");
			const budget = {
				...existing.data,
				...data,
				baseUpdatedAt:
					existing.data.baseUpdatedAt ?? (existing.syncedAt ? existing.data.updatedAt : undefined),
				updatedAt: new Date().toISOString(),
			};
			await localMonthlyBudgets.put(budget, id, owner);
			return budget;
		}
		const budget = await fetchWithAuth<MonthlyBudget>(`/monthly-budgets/${encodeURIComponent(id)}`, {
			body: JSON.stringify(data),
			method: "PUT",
		});
		cache(budget, owner);
		return budget;
	},
};
