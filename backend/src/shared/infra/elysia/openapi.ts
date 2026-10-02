import openapi from "@elysiajs/openapi";
import Elysia from "elysia";
import packageJson from "~/../../package.json";

export const docsPath = "/docs";

export const OpenAPI = new Elysia().use(
	openapi({
		documentation: {
			info: {
				description: "Personal Finance Management API",
				title: process.env.APP_NAME || "Zaimu API",
				version: packageJson.version,
			},
			tags: [
				{ name: "Users" },
				{ name: "Accounts" },
				{ name: "Transactions" },
				{ name: "Credit Cards" },
				{ name: "Loans" },
				{ name: "Debts" },
				{ name: "Recurring Payments" },
				{ name: "Categories" },
				{ name: "Dashboard" },
			],
		},
		exclude: { paths: [docsPath, `${docsPath}/json`] },
		path: docsPath,
	}),
);
