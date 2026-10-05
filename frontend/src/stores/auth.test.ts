import { expect, test } from "bun:test";

test("session initialization, identity races and operational failures", async () => {
	const child = Bun.spawn(
		[process.execPath, new URL("./tests/auth-state.fixture.ts", import.meta.url).pathname],
		{ stderr: "pipe", stdout: "pipe" },
	);
	const error = await new Response(child.stderr).text();
	expect(await child.exited, error).toBe(0);
});
