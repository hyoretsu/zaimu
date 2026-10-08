import { afterEach, describe, expect, test } from "bun:test";
import { assertFixtureServiceUrl, assertFixtureUrl, requireFixtureUrl } from "./fixture";
import { assertCompleteReport, assertLocalDockerSocket, assertTestClassification } from "./validation";

const original = { ...process.env };
afterEach(() => {
	for (const key of ["SERVICE_NAMESPACE", "ZAIMU_TEST_FIXTURE", "DATABASE_TEST_URL"]) {
		if (original[key] === undefined) delete process.env[key];
		else process.env[key] = original[key];
	}
});
const namespace = "zaimu_test_validation";
const database = `postgresql://runner:disposable@127.0.0.1:32501/${namespace}_0`;
function configure() {
	process.env.SERVICE_NAMESPACE = namespace;
	process.env.ZAIMU_TEST_FIXTURE = JSON.stringify({
		broker: "amqp://127.0.0.1:32503",
		databases: [database],
		namespace,
		redis: "redis://127.0.0.1:32502",
	});
}
describe("test runner boundaries", () => {
	test("rejects remote Docker endpoints before contacting daemon", () => {
		expect(() => assertLocalDockerSocket("unix:///var/run/docker.sock")).not.toThrow();
		for (const host of [
			"tcp://remote.example.com:2375",
			"ssh://remote.example.com",
			"unix://remote/socket",
		])
			expect(() => assertLocalDockerSocket(host)).toThrow("local Unix Docker socket");
	});
	test("classifies each discovered test exactly once", () => {
		expect(() => assertTestClassification(["a"], ["a"])).not.toThrow();
		for (const [discovered, classified] of [
			[["a", "b"], ["a"]],
			[["a"], ["a", "a"]],
			[["a"], ["a", "b"]],
		])
			expect(() => assertTestClassification(discovered!, classified!)).toThrow(
				"classification mismatch",
			);
	});
	test("rejects skipped, pending, todo and empty reports", () => {
		expect(() =>
			assertCompleteReport('<testsuite skipped="0"><testcase /></testsuite>', "suite"),
		).not.toThrow();
		for (const xml of [
			'<testsuite skipped="1"><testcase /></testsuite>',
			"<testcase><skipped /></testcase>",
			"<testcase><pending /></testcase>",
			"<testcase><todo /></testcase>",
			"<testsuite />",
		])
			expect(() => assertCompleteReport(xml, "suite")).toThrow("Skipped, pending or empty");
	});
	test("requires runner provenance and rejects external or unrelated local destinations", () => {
		delete process.env.ZAIMU_TEST_FIXTURE;
		expect(() => assertFixtureUrl(database)).toThrow("Disposable fixture required");
		configure();
		expect(assertFixtureUrl(database)).toBe(database);
		for (const value of [
			database.replace("127.0.0.1", "database.example.com"),
			database.replace("32501", "5432"),
			database.replace(`${namespace}_0`, "production"),
			database.replace("postgresql:", "https:"),
		])
			expect(() => assertFixtureUrl(value)).toThrow("disposable local fixture");
		expect(() => assertFixtureServiceUrl("redis://external.example.com:6379")).toThrow(
			"disposable local fixture",
		);
		process.env.SERVICE_NAMESPACE = "zaimu";
		expect(() => assertFixtureUrl(database)).toThrow("namespace");
	});
	test("direct integration invocation gives runner instruction", () => {
		delete process.env.DATABASE_TEST_URL;
		expect(() => requireFixtureUrl("DATABASE_TEST_URL")).toThrow("scripts/test-runner.ts");
	});
});
