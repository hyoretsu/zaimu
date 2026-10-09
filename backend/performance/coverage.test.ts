import { expect, test } from "bun:test";
import { completeCoverage, evaluateCoverage } from "./coverage";

test("matching route scenarios do not hide failed or missing screens and journeys", () => {
	const inventory = {
		journeys: [{ result: "pending" }],
		routes: [{ method: "PATCH", path: "/credit-cards/:id/purchases/:purchaseId", result: "pending" }],
		screens: [{ result: "pending" }],
	};
	const measured = evaluateCoverage(inventory, {
		purchase: { passed: true, samples: [{ method: "PATCH", path: "/credit-cards/fixture/purchases/new" }] },
	});
	expect(measured.routes[0]?.result).toBe("passed");
	expect(completeCoverage(measured)).toBeFalse();
	const failed = evaluateCoverage(inventory, {
		purchase: { passed: false, samples: [{ method: "PATCH", path: "/credit-cards/fixture/purchases/new" }] },
	});
	expect(failed.routes[0]?.result).toBe("failed");
	expect(evaluateCoverage(inventory, {}).routes[0]?.result).toBe("pending");
});
