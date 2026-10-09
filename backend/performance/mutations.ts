import { pdfFixture } from "./pdf-fixture";
import { cleanupPerformanceLoan } from "./preflight";
import { captureRequest, completeMetrics, percentile, type RequestSample, runConcurrent } from "./runner";

const purchaseCases: Record<string, Record<string, unknown>> = {
	purchase: {},
	purchase12: { installments: 12 },
	purchase48: { installments: 48 },
	purchaseCharge: { isStatementCharge: true },
	purchaseDebt: {
		debtSplit: {
			mode: "SHARES",
			ownerShares: 1,
			participants: [{ debtPersonId: "perf-debt-person-owner", shares: 1 }],
		},
	},
	purchaseForeign: { currency: "USD", totalAmount: 20 },
	purchaseRetroactive: { installments: 12, purchaseDate: "2026-01-10" },
	purchaseTags: { storeName: "Performance Store", tagIds: ["perf-category-1"] },
};
export const mutationScenarios = [
	...Object.keys(purchaseCases),
	"purchaseRefund",
	"purchaseMove",
	"purchaseRefinance",
	"transaction",
	"transfer",
	"category",
	"account",
	"recurrence",
	"loan",
	"debtPerson",
	"balanceAdjustment",
	"currencyPreference",
	"cardPayment",
	"loanPayment",
	"debtEvent",
	"sync",
	"statementImport",
	"invoiceImport",
];
const expectedActions = (name: string): string[] => {
	if (name === "sync") return ["snapshot"];
	if (name === "currencyPreference") return ["edit"];
	if (name === "cardPayment") return ["pay", "delete"];
	if (name === "loanPayment") return ["create", "pay", "readAfterWrite"];
	if (name === "loan") return ["create", "readAfterWrite"];
	if (name.endsWith("Import")) return ["parse", "review", "delete"];
	if (name.startsWith("purchase"))
		return [
			"create",
			"readAfterWrite",
			"delete",
			...(name === "purchaseRefund"
				? ["refund", "editRefund", "deleteRefund"]
				: name === "purchaseMove"
					? ["move"]
					: name === "purchaseRefinance"
						? ["refinance", "deleteRefinanced"]
						: name === "purchaseCharge"
							? []
							: ["edit"]),
		];
	return [
		"create",
		"delete",
		...(["category", "account", "transaction", "recurrence", "debtPerson"].includes(name) ? ["edit"] : []),
		...(["category", "recurrence"].includes(name) ? ["readAfterWrite"] : []),
	];
};
interface Context {
	base: URL;
	cookies: string[];
	iterations: number;
	load: number;
	requester?: typeof fetch;
}
interface ActionSample extends RequestSample {
	action: string;
	index: number;
	user: number;
}
const record = (value: unknown): Record<string, unknown> => {
	if (!value || typeof value !== "object" || Array.isArray(value))
		throw new Error("Expected response object");
	return value as Record<string, unknown>;
};
const responseId = (value: unknown) => {
	const row = record(Array.isArray(value) ? value[0] : value);
	const id = row.purchaseId ?? row.id;
	if (typeof id !== "string" || !id) throw new Error("Missing created record identity");
	return id;
};

export async function runMutationScenario(name: string, context: Context) {
	const startedAt = performance.now();
	const budgetMs = ["sync", "statementImport", "invoiceImport"].includes(name) ? 30000 : 1000;
	const samples: ActionSample[] = [];
	const errors: { index: number; user: number; phase: string; error: string }[] = [];
	await runConcurrent(context.iterations, context.load, async (index, user) => {
		const prefix = user === 0 ? "perf-" : `p${user}-`;
		const path = (value: string) => value.replaceAll("perf-", prefix);
		const call = async (action: string, route: string, method = "GET", body?: unknown, measured = true) => {
			const result = await captureRequest(
				new URL(path(route), context.base),
				{
					headers: {
						cookie: context.cookies[user]!,
						...(body instanceof FormData ? {} : { "content-type": "application/json" }),
					},
					method,
					...(body === undefined
						? {}
						: { body: body instanceof FormData ? body : JSON.stringify(body).replaceAll("perf-", prefix) }),
				},
				context.requester,
			);
			if (measured) samples.push({ ...result.sample, action, index, user });
			if (result.sample.status < 200 || result.sample.status >= 300 || result.sample.error)
				throw new Error(`${action}: HTTP ${result.sample.status}`);
			return result.text ? (JSON.parse(result.text) as unknown) : null;
		};
		let cleanup: (() => Promise<unknown>) | undefined;
		let setupCleanup: (() => Promise<unknown>) | undefined;
		try {
			const label = `Performance ${name} ${crypto.randomUUID().slice(0, 8)}`;
			if (name === "statementImport" || name === "invoiceImport") {
				const invoice = name === "invoiceImport";
				const route = invoice ? "/credit-card-imports" : "/transaction-imports";
				const lines = invoice
					? [
							"Data de vencimento: 24 AGO 2026",
							"Período vigente: 17 JUL a 17 AGO",
							"TRANSAÇÕES DE 17 JUL A 17 AGO",
							...Array.from({ length: 1000 }, (_, i) => `07 AGO Performance ${i} R$ 1,00`),
						]
					: [
							"01 DE AGOSTO DE 2026 a 31 DE AGOSTO DE 2026 VALORES EM R$",
							"Movimentações",
							"03 AGO 2026 Total de saídas - 1.000,00",
							...Array.from(
								{ length: 1000 },
								(_, i) => `Transferência enviada pelo Pix Performance ${i}\n1,00`,
							).flatMap(line => line.split("\n")),
						];
				const form = new FormData();
				form.set("file", new File([pdfFixture(lines)], "performance.pdf", { type: "application/pdf" }));
				form.set("provider", "NUBANK");
				form.set(
					invoice ? "creditCardId" : "financialAccountId",
					path(invoice ? "perf-card-01" : "perf-account-main"),
				);
				const result = record(await call("parse", `${route}/`, "POST", form));
				const imported = record(result[invoice ? "creditCardImport" : "transactionImport"]);
				const id = responseId(imported);
				cleanup = () => call("delete", `${route}/${id}`, "DELETE");
				const items = imported.items;
				if (
					!Array.isArray(items) ||
					items.length !== 50 ||
					Number(imported.pendingItemCount) !== 1000 ||
					imported.hasMore !== true
				)
					throw new Error("Import fixture lost records");
				await call("review", `${route}/${id}`);
			} else if (name === "sync") {
				const snapshot = record(await call("snapshot", "/sync/", "POST", {}));
				if (!snapshot.serverData || !snapshot.syncResults) throw new Error("Incomplete sync snapshot");
			} else if (name === "cardPayment") {
				const result = record(
					await call("pay", "/credit-cards/perf-card-01/payments", "POST", {
						amount: 12.34,
						date: "2026-10-04",
						financialAccountId: path("perf-account-main"),
						time: null,
					}),
				);
				const transaction = record(result.transaction);
				cleanup = () => call("delete", `/transactions/${transaction.id}`, "DELETE");
				if (Number(transaction.amount) !== 12.34) throw new Error("Payment amount mismatch");
			} else if (name.startsWith("purchase")) {
				const base = "/credit-cards/perf-card-01";
				const body: Record<string, unknown> = {
					currency: "BRL",
					description: label,
					installments: 1,
					purchaseDate: "2026-10-04",
					time: null,
					totalAmount: 120.01,
					...(purchaseCases[name] ?? {}),
				};
				const created = await call("create", `${base}/purchases`, "POST", body);
				const id = responseId(created);
				let card = base;
				cleanup = () => call("delete", `${card}/purchases/${id}`, "DELETE");
				const createdRows = Array.isArray(created) ? created.map(record) : [record(created)];
				if (!body.isStatementCharge) {
					const expectedCents = body.currency === "USD" ? 10000 : 12001;
					const actualCents = createdRows
						.filter(row => !row.isRefund)
						.reduce((sum, row) => sum + Math.round(Number(row.installmentAmount) * 100), 0);
					if (actualCents !== expectedCents) throw new Error("Installments do not conserve booked principal");
				}
				if (!body.isStatementCharge && createdRows.filter(row => !row.isRefund).length !== body.installments)
					throw new Error("Incomplete installment response");
				if (createdRows.some(row => row.purchaseId && row.purchaseId !== id))
					throw new Error("Unrelated purchase in mutation response");
				if (name === "purchaseRefund") {
					const refund = record(
						await call("refund", `${base}/purchases/${id}/refunds`, "POST", {
							amount: 10,
							policy: "KEEP_INSTALLMENTS",
							purchaseDate: "2026-10-04",
						}),
					);
					if (!refund.isRefund || Number(record(refund.refund).amount) !== 10)
						throw new Error("Refund amount mismatch");
					await call("editRefund", `${base}/purchases/${id}/refunds/${refund.id}`, "PATCH", { amount: 5 });
					await call("deleteRefund", `${base}/purchases/${id}/refunds/${refund.id}`, "DELETE");
				} else if (name === "purchaseMove") {
					await call("move", `${base}/purchases/${id}`, "PATCH", { creditCardId: path("perf-card-02") });
					card = "/credit-cards/perf-card-02";
				} else if (name === "purchaseRefinance") {
					const result = record(
						await call("refinance", `${base}/purchases/${id}/refinance`, "POST", {
							feeAmount: 1,
							installments: 12,
							purchaseDate: "2026-10-04",
						}),
					);
					const ids = [
						...new Set(
							(result.purchases as unknown[])
								.map(row => String(record(row).purchaseId))
								.filter(value => value !== id),
						),
					];
					// Only replacement records settling this purchase belong to this scenario.
					const replacements = (result.purchases as unknown[])
						.map(record)
						.filter(
							row => ids.includes(String(row.purchaseId)) && row.description === `Parcelamento - ${label}`,
						);
					cleanup = async () => {
						for (const replacement of [...new Set(replacements.map(row => String(row.purchaseId)))])
							await call("deleteRefinanced", `${base}/purchases/${replacement}`, "DELETE");
						return call("delete", `${base}/purchases/${id}`, "DELETE");
					};
					if (replacements.length !== 12 || Number(result.totalAmount) !== 121.01)
						throw new Error("Refinancing amount or schedule mismatch");
				} else if (name !== "purchaseCharge") {
					const updated = record(
						await call("edit", `${base}/purchases/${id}`, "PATCH", { description: `${label} updated` }),
					);
					if (updated.description !== `${label} updated`) throw new Error("Stale edit response");
				}
				const book = record(await call("readAfterWrite", `${card}/book`));
				const rows = book.purchases;
				if (
					!Array.isArray(rows) ||
					!rows.some(row => record(row).id === id || record(row).purchaseId === id)
				) {
					if (name !== "purchaseCharge") throw new Error("Created purchase missing after write");
				}
			} else {
				const definitions: Record<
					string,
					{ route: string; body: Record<string, unknown>; edit?: Record<string, unknown>; detail?: boolean }
				> = {
					account: {
						body: { currency: "BRL", name: label, type: "CHECKING" },
						edit: { name: `${label} updated` },
						route: "/financial-accounts",
					},
					balanceAdjustment: {
						body: {
							balance: 1000,
							date: `2090-${String(Math.floor(index / 28) + 1).padStart(2, "0")}-${String((index % 28) + 1).padStart(2, "0")}`,
							financialAccountId: "perf-account-main",
						},
						route: "/balance-adjustments",
					},
					category: {
						body: { name: label },
						detail: true,
						edit: { name: `${label} updated` },
						route: "/categories",
					},
					debtEvent: {
						body: {
							amount: 12.34,
							currency: "BRL",
							date: "2026-10-04",
							description: label,
							isOwedToMe: true,
							personId: "perf-debt-person-owner",
						},
						route: "/debts/events",
					},
					debtPerson: { body: { name: label }, edit: { name: `${label} updated` }, route: "/debts/people" },
					loan: {
						body: {
							dueDay: 5,
							firstDueDate: "2026-11-05",
							interestRate: 0,
							lender: label,
							principalAmount: 1000,
							startDate: "2026-10-04",
							totalInstallments: 12,
						},
						detail: true,
						route: "/loans",
					},
					loanPayment: {
						body: {
							dueDay: 5,
							firstDueDate: "2026-11-05",
							interestRate: 0,
							lender: label,
							principalAmount: 1200,
							startDate: "2026-10-04",
							totalInstallments: 12,
						},
						detail: true,
						route: "/loans",
					},
					recurrence: {
						body: {
							amount: 12.34,
							interval: 1,
							movement: "EXPENSE",
							name: label,
							originFinancialAccountId: "perf-account-main",
							startDate: "2026-11-01",
							unit: "MONTH",
						},
						detail: true,
						edit: { name: `${label} updated` },
						route: "/recurring",
					},
					transaction: {
						body: {
							amount: 12.34,
							date: "2026-10-04",
							description: label,
							originFinancialAccountId: "perf-account-main",
							type: "EXPENSE",
						},
						edit: { amount: 13.34, description: `${label} updated` },
						route: "/transactions",
					},
					transfer: {
						body: {
							amount: 12.34,
							date: "2026-10-04",
							description: label,
							destinationFinancialAccountId: "perf-account-card-01",
							originFinancialAccountId: "perf-account-main",
							type: "TRANSFER",
						},
						route: "/transactions",
					},
				};
				if (name === "currencyPreference") {
					const before = record(await call("setup", "/currency-preferences/", "GET", undefined, false));
					cleanup = () =>
						call(
							"restore",
							"/currency-preferences/",
							"PATCH",
							{ preferredCurrency: before.preferredCurrency },
							false,
						);
					const after = record(
						await call("edit", "/currency-preferences/", "PATCH", { preferredCurrency: "BRL" }),
					);
					if (after.preferredCurrency !== "BRL") throw new Error("Preference mismatch");
				} else {
					const definition = definitions[name];
					if (!definition) throw new Error("Unknown mutation scenario");
					if (name === "transfer") {
						const account = await call(
							"setup",
							"/financial-accounts/",
							"POST",
							{ currency: "BRL", name: `${label} destination`, type: "CHECKING" },
							false,
						);
						const accountId = responseId(account);
						definition.body.destinationFinancialAccountId = accountId;
						setupCleanup = () =>
							call("cleanupAccount", `/financial-accounts/${accountId}`, "DELETE", undefined, false);
					}
					const created = await call(
						"create",
						`${definition.route}${["debtPerson", "debtEvent"].includes(name) ? "" : "/"}`,
						"POST",
						definition.body,
					);
					const id = responseId(created);
					cleanup = ["loan", "loanPayment"].includes(name)
						? () => cleanupPerformanceLoan(id, user)
						: () => call("delete", `${definition.route}/${id}`, "DELETE");
					if (name === "loanPayment") {
						const paid = record(
							await call("pay", `/loans/${id}/payments/1/pay`, "POST", {
								financialAccountId: path("perf-account-main"),
								paidDate: "2026-10-04",
							}),
						);
						if (!paid.paidDate || Number(paid.principalPaid) !== 100)
							throw new Error("Loan payment mismatch");
					}
					if (definition.edit) await call("edit", `${definition.route}/${id}`, "PATCH", definition.edit);
					if (definition.detail) await call("readAfterWrite", `${definition.route}/${id}`);
				}
			}
		} catch (error) {
			errors.push({
				error: error instanceof Error ? error.message : "scenario-error",
				index,
				phase: "scenario",
				user,
			});
		} finally {
			for (const operation of [cleanup, setupCleanup])
				if (operation)
					try {
						await operation();
					} catch (error) {
						errors.push({
							error: error instanceof Error ? error.message : "cleanup-error",
							index,
							phase: "cleanup",
							user,
						});
					}
		}
	});
	const grouped = Map.groupBy(samples, sample => sample.action);
	const actions = Object.fromEntries(
		[...grouped].map(([action, rows]) => [
			action,
			{
				count: rows.length,
				maxQueries: Math.max(...rows.map(row => row.queries ?? Number.POSITIVE_INFINITY)),
				p50Ms: percentile(
					rows.map(row => row.durationMs),
					0.5,
				),
				p95Ms: percentile(
					rows.map(row => row.durationMs),
					0.95,
				),
				p99Ms: percentile(
					rows.map(row => row.durationMs),
					0.99,
				),
				passed:
					rows.length === context.iterations &&
					rows.every(row => row.status >= 200 && row.status < 300 && completeMetrics(row)) &&
					percentile(
						rows.map(row => row.durationMs),
						0.95,
					) < budgetMs,
			},
		]),
	);
	return {
		actions,
		elapsedMs: performance.now() - startedAt,
		errors,
		expectedActions: expectedActions(name),
		p95Ms: samples.length
			? percentile(
					samples.map(row => row.durationMs),
					0.95,
				)
			: null,
		passed:
			!errors.length &&
			expectedActions(name).every(action => actions[action]?.passed) &&
			samples.length > 0 &&
			Object.values(actions).every(action => action.passed),
		samples,
		throughputPerSecond: (context.iterations * 1000) / (performance.now() - startedAt),
	};
}
