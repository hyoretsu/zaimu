import { $ } from "bun";

if (Bun.which("git")) {
	await $`git config --local core.hooksPath .githooks`.quiet();
}
