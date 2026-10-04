import { freezePerformanceDate } from "./clock";

freezePerformanceDate();
const target = new URL(process.env.PERFORMANCE_DATABASE_URL ?? "");
if (target.hostname !== "127.0.0.1" || target.port !== "55495" || target.pathname !== "/zaimu_performance")
	throw new Error("Dedicated DB required");
process.env.DATABASE_URL = target.href;
process.env.REDIS_URL = "redis://127.0.0.1:6395";
process.env.SERVICE_NAMESPACE = "zaimu_performance";
process.env.BETTER_AUTH_SECRET = "local-performance-profile-secret-at-least-32";
const { dashboardFinancialContext } = await import(
	"../src/modules/dashboard/application/dashboard-financial-context"
);
const { loadDashboardData } = await import("../src/modules/dashboard/application/load-dashboard-data");
const { closeDatabase } = await import("sql");
const started = performance.now();
try {
	const data = await loadDashboardData("performance-user", {
		balanceDates: [new Date("2026-10-04T12:00:00Z")],
		comparisonEnd: new Date("2027-08-31T12:00:00Z"),
		comparisonStart: new Date("2026-10-01T12:00:00Z"),
		periodEnd: new Date("2026-10-31T12:00:00Z"),
		periodStart: new Date("2026-10-01T12:00:00Z"),
		projectionStart: new Date("2026-10-05T12:00:00Z"),
		today: new Date("2026-10-04T12:00:00Z"),
	});
	const range = { end: new Date("2026-10-31T12:00:00Z"), start: new Date("2026-10-01T12:00:00Z") };
	dashboardFinancialContext(
		data,
		range,
		new Date("2026-10-04T12:00:00Z"),
		new Date("2026-10-05T12:00:00Z"),
		new Date("2027-08-31T12:00:00Z"),
	);
	console.log(
		JSON.stringify({
			cards: data.cards.length,
			durationMs: performance.now() - started,
			flows: data.flows.length,
		}),
	);
} finally {
	await closeDatabase();
}
